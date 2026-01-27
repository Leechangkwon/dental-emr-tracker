import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as XLSX from 'xlsx';
import { Bindings } from './types';
import { parseInsuranceData, parseSurgeryImplant, parseSurgeryBone } from './parser';
import { saveImplantRecords, saveBoneGraftRecords, queryTreatmentRecords, deleteTreatmentRecord, deleteTreatmentRecordsBatch, updateBoneGraft, updateImplant } from './database';
import { parseEcountProducts } from './ecount-parser';
import { saveEcountProducts, queryEcountProducts, updateEcountProduct, deleteEcountProduct } from './ecount-db';

const app = new Hono<{ Bindings: Bindings }>();

// CORS 설정
app.use('/api/*', cors());

/**
 * 엑셀 파일 업로드 및 처리 API
 * POST /api/upload
 * Body: FormData with files and branchName
 */
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const branchName = formData.get('branchName') as string;
    const surgeryFile = formData.get('surgeryFile') as File | null;
    const insuranceFile = formData.get('insuranceFile') as File | null;

    if (!branchName) {
      return c.json({ success: false, message: '지점명을 입력해주세요.' }, 400);
    }

    const db = c.env.DB;
    let totalRecords = 0;
    const errors: string[] = [];

    // 보험 데이터 파싱 (급여 임플란트 시트)
    let insMap = new Map<string, string[]>();
    if (insuranceFile) {
      try {
        const insBuffer = await insuranceFile.arrayBuffer();
        const insWorkbook = XLSX.read(insBuffer);
        const insSheetName = '급여 임플란트';
        
        if (insWorkbook.SheetNames.includes(insSheetName)) {
          const insSheet = insWorkbook.Sheets[insSheetName];
          insMap = parseInsuranceData(insSheet);
        } else {
          errors.push(`'${insSheetName}' 시트를 찾을 수 없습니다.`);
        }
      } catch (err) {
        errors.push(`보험 파일 처리 중 오류: ${err}`);
      }
    }

    // 수술기록지 파싱 (통합 시트)
    if (surgeryFile) {
      try {
        const surgBuffer = await surgeryFile.arrayBuffer();
        const surgWorkbook = XLSX.read(surgBuffer);

        const sheetName = '수술기록지';
        
        if (!surgWorkbook.SheetNames.includes(sheetName)) {
          errors.push(`'${sheetName}' 시트를 찾을 수 없습니다. 현재 시트: ${surgWorkbook.SheetNames.join(', ')}`);
        } else {
          const sheet = surgWorkbook.Sheets[sheetName];
          
          // 동일한 시트에서 임플란트와 동종골 모두 파싱
          const implantRecords = parseSurgeryImplant(sheet, insMap);
          const implantCount = await saveImplantRecords(db, branchName, implantRecords);
          totalRecords += implantCount;

          const boneRecords = parseSurgeryBone(sheet);
          const boneCount = await saveBoneGraftRecords(db, branchName, boneRecords);
          totalRecords += boneCount;
        }
      } catch (err) {
        errors.push(`수술기록지 처리 중 오류: ${err}`);
      }
    }

    // 파일이 하나도 선택되지 않은 경우
    if (!surgeryFile && !insuranceFile) {
      return c.json({
        success: false,
        message: '최소 하나의 파일을 선택해주세요.',
        errors: []
      }, 400);
    }

    // 에러가 있는 경우
    if (errors.length > 0) {
      return c.json({
        success: false,
        message: '일부 데이터 처리 중 오류가 발생했습니다.',
        recordsProcessed: totalRecords,
        errors
      }, 400);
    }

    // 성공
    return c.json({
      success: true,
      message: `${totalRecords}개의 레코드가 성공적으로 저장되었습니다.`,
      recordsProcessed: totalRecords
    });
  } catch (err) {
    console.error('Upload error:', err);
    return c.json({
      success: false,
      message: `서버 오류: ${err}`
    }, 500);
  }
});

/**
 * 치료 기록 조회 API
 * GET /api/records?branch_name=지점명&patient_name=환자명&chart_number=차트번호&start_date=날짜&end_date=날짜&supplier=품목군&product_name=품목명
 */
app.get('/api/records', async (c) => {
  try {
    const branchName = c.req.query('branch_name');
    const patientName = c.req.query('patient_name');
    const chartNumber = c.req.query('chart_number');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const supplier = c.req.query('supplier');
    const productName = c.req.query('product_name');

    const db = c.env.DB;
    const records = await queryTreatmentRecords(
      db, 
      branchName, 
      patientName, 
      chartNumber,
      startDate,
      endDate,
      supplier,
      productName
    );

    return c.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (err) {
    console.error('Query error:', err);
    return c.json({
      success: false,
      message: `조회 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 치료 기록 삭제 API
 * DELETE /api/records/:id
 */
app.delete('/api/records/:id', async (c) => {
  try {
    const recordId = parseInt(c.req.param('id'));
    const db = c.env.DB;
    
    const success = await deleteTreatmentRecord(db, recordId);
    
    if (success) {
      return c.json({
        success: true,
        message: '레코드가 삭제되었습니다.'
      });
    } else {
      return c.json({
        success: false,
        message: '레코드 삭제에 실패했습니다.'
      }, 400);
    }
  } catch (err) {
    console.error('Delete error:', err);
    return c.json({
      success: false,
      message: `삭제 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 여러 치료 기록 일괄 삭제 API
 * POST /api/records/batch-delete
 */
app.post('/api/records/batch-delete', async (c) => {
  try {
    const { record_ids } = await c.req.json();
    
    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
      return c.json({
        success: false,
        message: '삭제할 레코드 ID를 제공해주세요.'
      }, 400);
    }
    
    const db = c.env.DB;
    const result = await deleteTreatmentRecordsBatch(db, record_ids);
    
    return c.json({
      success: true,
      message: `${result.success}개의 레코드가 삭제되었습니다.${result.failed > 0 ? ` (실패: ${result.failed}개)` : ''}`,
      deleted: result.success,
      failed: result.failed
    });
  } catch (err) {
    console.error('Batch delete error:', err);
    return c.json({
      success: false,
      message: `일괄 삭제 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 뼈이식 데이터 수정 API
 * PUT /api/bone-graft/:id
 */
app.put('/api/bone-graft/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const { date, product_name, quantity, supplier } = await c.req.json();
    const db = c.env.DB;
    
    const success = await updateBoneGraft(db, id, date, product_name, quantity, supplier);
    
    if (success) {
      return c.json({
        success: true,
        message: '뼈이식 데이터가 수정되었습니다.'
      });
    } else {
      return c.json({
        success: false,
        message: '수정에 실패했습니다.'
      }, 400);
    }
  } catch (err) {
    console.error('Update error:', err);
    return c.json({
      success: false,
      message: `수정 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 임플란트 데이터 수정 API
 * PUT /api/implant/:id
 */
app.put('/api/implant/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const { date, product_name, quantity, supplier, is_insurance } = await c.req.json();
    const db = c.env.DB;
    
    const success = await updateImplant(db, id, date, product_name, quantity, supplier, is_insurance);
    
    if (success) {
      return c.json({
        success: true,
        message: '임플란트 데이터가 수정되었습니다.'
      });
    } else {
      return c.json({
        success: false,
        message: '수정에 실패했습니다.'
      }, 400);
    }
  } catch (err) {
    console.error('Update error:', err);
    return c.json({
      success: false,
      message: `수정 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 지점 목록 조회 API
 * GET /api/branches
 */
app.get('/api/branches', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db
      .prepare(`SELECT DISTINCT branch_name FROM treatment_records ORDER BY branch_name`)
      .all<{ branch_name: string }>();

    return c.json({
      success: true,
      data: result.results.map((r) => r.branch_name)
    });
  } catch (err) {
    return c.json({
      success: false,
      message: `조회 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 데이터베이스 초기화 API (개발용)
 * DELETE /api/reset
 */
app.delete('/api/reset', async (c) => {
  try {
    const db = c.env.DB;
    
    await db.prepare(`DELETE FROM bone_graft`).run();
    await db.prepare(`DELETE FROM implant`).run();
    await db.prepare(`DELETE FROM temporary_denture`).run();
    await db.prepare(`DELETE FROM prosthetic_occlusion`).run();
    await db.prepare(`DELETE FROM prosthetic_completion`).run();
    await db.prepare(`DELETE FROM treatment_records`).run();

    return c.json({
      success: true,
      message: '모든 데이터가 삭제되었습니다.'
    });
  } catch (err) {
    return c.json({
      success: false,
      message: `초기화 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 메인 페이지
 */
