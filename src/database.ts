import { Bindings, TreatmentRecord, BoneGraft, Implant, TreatmentView } from './types';
import { ImplantRecord, BoneGraftRecord } from './parser';
import { VENDOR_MAP } from './utils';

/**
 * 치료 기록 저장 또는 조회
 */
export async function findOrCreateTreatmentRecord(
  db: D1Database,
  branchName: string,
  patientName: string,
  chartNumber: string,
  toothNumber: string
): Promise<number> {
  // 기존 레코드 조회
  const existing = await db
    .prepare(
      `SELECT id FROM treatment_records 
       WHERE branch_name = ? AND chart_number = ? AND tooth_number = ?`
    )
    .bind(branchName, chartNumber, toothNumber)
    .first<{ id: number }>();

  if (existing) {
    return existing.id;
  }

  // 새 레코드 생성
  const result = await db
    .prepare(
      `INSERT INTO treatment_records (branch_name, patient_name, chart_number, tooth_number)
       VALUES (?, ?, ?, ?)`
    )
    .bind(branchName, patientName, chartNumber, toothNumber)
    .run();

  return result.meta.last_row_id as number;
}

/**
 * 임플란트 데이터 저장
 */
export async function saveImplantRecords(
  db: D1Database,
  branchName: string,
  records: ImplantRecord[]
): Promise<number> {
  let count = 0;

  for (const record of records) {
    // 각 치아별로 레코드 생성
    for (const tooth of record.teethSet) {
      const treatmentId = await findOrCreateTreatmentRecord(
        db,
        branchName,
        record.patientName,
        record.chartNumber,
        tooth
      );

      // 임플란트 데이터 저장
      await db
        .prepare(
          `INSERT INTO implant (treatment_record_id, date, product_name, quantity, amount, supplier, is_insurance)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          treatmentId,
          record.date,
          record.productName,
          1, // 치아별로 1개씩
          0, // 금액은 현재 0 (향후 확장)
          record.supplier,
          record.isInsurance ? 1 : 0
        )
        .run();

      count++;
    }
  }

  return count;
}

/**
 * 동종골 데이터 저장
 */
export async function saveBoneGraftRecords(
  db: D1Database,
  branchName: string,
  records: BoneGraftRecord[]
): Promise<number> {
  let count = 0;

  for (const record of records) {
    // 각 치아별로 레코드 생성
    for (const tooth of record.teethSet) {
      const treatmentId = await findOrCreateTreatmentRecord(
        db,
        branchName,
        record.patientName,
        record.chartNumber,
        tooth
      );

      // 각 품목별로 저장
      for (const [productName, quantity] of record.products.entries()) {
        // 거래처 결정
        let supplier = '기타/미지정';
        for (const [key, value] of Object.entries(VENDOR_MAP)) {
          if (productName.toUpperCase().includes(key.toUpperCase())) {
            supplier = value;
            break;
          }
        }

        await db
          .prepare(
            `INSERT INTO bone_graft (treatment_record_id, date, product_name, quantity, amount, supplier)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(
            treatmentId,
            record.date,
            productName,
            quantity,
            0, // 금액은 현재 0 (향후 확장)
            supplier
          )
          .run();

        count++;
      }
    }
  }

  return count;
}

/**
 * 치료 기록 조회 (필터링)
 */
export async function queryTreatmentRecords(
  db: D1Database,
  branchName?: string,
  patientName?: string,
  chartNumber?: string,
  startDate?: string,
  endDate?: string,
  supplier?: string,
  productName?: string
): Promise<TreatmentView[]> {
  // 기본 쿼리
  let query = `
    SELECT DISTINCT
      tr.id,
      tr.branch_name,
      tr.patient_name,
      tr.chart_number,
      tr.tooth_number,
      tr.created_at,
      tr.updated_at
    FROM treatment_records tr
    LEFT JOIN bone_graft bg ON tr.id = bg.treatment_record_id
    LEFT JOIN implant im ON tr.id = im.treatment_record_id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (branchName) {
    query += ` AND tr.branch_name = ?`;
    params.push(branchName);
  }

  if (patientName) {
    query += ` AND tr.patient_name LIKE ?`;
    params.push(`%${patientName}%`);
  }

  if (chartNumber) {
    query += ` AND tr.chart_number = ?`;
    params.push(chartNumber);
  }

  // 날짜 필터
  if (startDate) {
    query += ` AND (bg.date >= ? OR im.date >= ?)`;
    params.push(startDate, startDate);
  }

  if (endDate) {
    query += ` AND (bg.date <= ? OR im.date <= ?)`;
    params.push(endDate, endDate);
  }

  // 품목군(거래처) 필터
  if (supplier) {
    query += ` AND (bg.supplier LIKE ? OR im.supplier LIKE ?)`;
    params.push(`%${supplier}%`, `%${supplier}%`);
  }

  // 품목명 필터
  if (productName) {
    query += ` AND (bg.product_name LIKE ? OR im.product_name LIKE ?)`;
    params.push(`%${productName}%`, `%${productName}%`);
  }

  query += ` ORDER BY tr.created_at DESC, tr.patient_name, tr.chart_number, tr.tooth_number`;

  const stmt = db.prepare(query);
  const result = await stmt.bind(...params).all<TreatmentRecord>();

  // 각 레코드에 대해 관련 데이터 조회
  const views: TreatmentView[] = [];

  for (const record of result.results) {
    // 뼈이식 데이터 조회
    const boneGrafts = await db
      .prepare(`SELECT * FROM bone_graft WHERE treatment_record_id = ? ORDER BY date DESC`)
      .bind(record.id)
      .all<BoneGraft>();

    // 임플란트 데이터 조회
    const implants = await db
      .prepare(`SELECT * FROM implant WHERE treatment_record_id = ? ORDER BY date DESC`)
      .bind(record.id)
      .all<Implant>();

    views.push({
      id: record.id!,
      branch_name: record.branch_name,
      patient_name: record.patient_name,
      chart_number: record.chart_number,
      tooth_number: record.tooth_number,
      bone_graft: boneGrafts.results,
      implant: implants.results,
      created_at: record.created_at || '',
      updated_at: record.updated_at || ''
    });
  }

  return views;
}

/**
 * 치료 기록 삭제
 */
export async function deleteTreatmentRecord(
  db: D1Database,
  recordId: number
): Promise<boolean> {
  try {
    // CASCADE 삭제로 관련 데이터 자동 삭제
    await db
      .prepare(`DELETE FROM treatment_records WHERE id = ?`)
      .bind(recordId)
      .run();
    
    return true;
  } catch (err) {
    console.error('Delete error:', err);
    return false;
  }
}

/**
 * 여러 치료 기록 일괄 삭제
 */
export async function deleteTreatmentRecordsBatch(
  db: D1Database,
  recordIds: number[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const id of recordIds) {
    try {
      await db
        .prepare(`DELETE FROM treatment_records WHERE id = ?`)
        .bind(id)
        .run();
      success++;
    } catch (err) {
      console.error(`Delete error for record ${id}:`, err);
      failed++;
    }
  }

  return { success, failed };
}


/**
 * 뼈이식 데이터 수정
 */
export async function updateBoneGraft(
  db: D1Database,
  id: number,
  date: string,
  productName: string,
  quantity: number,
  supplier: string
): Promise<boolean> {
  try {
    await db
      .prepare(
        `UPDATE bone_graft 
         SET date = ?, product_name = ?, quantity = ?, supplier = ?
         WHERE id = ?`
      )
      .bind(date, productName, quantity, supplier, id)
      .run();
    
    return true;
  } catch (err) {
    console.error('Update bone graft error:', err);
    return false;
  }
}

/**
 * 임플란트 데이터 수정
 */
export async function updateImplant(
  db: D1Database,
  id: number,
  date: string,
  productName: string,
  quantity: number,
  supplier: string,
  isInsurance: boolean
): Promise<boolean> {
  try {
    await db
      .prepare(
        `UPDATE implant 
         SET date = ?, product_name = ?, quantity = ?, supplier = ?, is_insurance = ?
         WHERE id = ?`
      )
      .bind(date, productName, quantity, supplier, isInsurance ? 1 : 0, id)
      .run();
    
    return true;
  } catch (err) {
    console.error('Update implant error:', err);
    return false;
  }
}
