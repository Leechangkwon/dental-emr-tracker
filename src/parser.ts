import * as XLSX from 'xlsx';
import {
  toHalfWidth,
  parsePatientInfo,
  expandTeethRange,
  formatDate,
  determineSupplier,
  extractProductName,
  extractBoneGraftProducts,
  VENDOR_MAP
} from './utils';

/**
 * 급여 임플란트 데이터를 맵으로 변환
 * Key: "날짜|차트번호", Value: 치아번호 배열
 */
export function parseInsuranceData(sheet: XLSX.WorkSheet): Map<string, string[]> {
  const insMap = new Map<string, string[]>();
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  // 헤더 제외하고 데이터 처리
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    
    const patientInfo = String(row[0] || ''); // A열: 환자정보
    const toothNumber = String(row[1] || '').replace('#', '').trim(); // B열: 치식
    const stage2Date = row[3]; // D열: 2단계 날짜
    
    if (!stage2Date || !toothNumber) continue;
    
    // 차트번호 추출
    const chartMatch = patientInfo.match(/\d+/);
    const chartNum = chartMatch ? chartMatch[0] : '';
    
    // 날짜 포맷
    let dateKey = '';
    if (stage2Date instanceof Date) {
      dateKey = formatDate(stage2Date);
    } else if (typeof stage2Date === 'string') {
      dateKey = stage2Date;
    }
    
    const key = `${dateKey}|${chartNum}`;
    
    if (!insMap.has(key)) {
      insMap.set(key, []);
    }
    insMap.get(key)!.push(toothNumber);
  }
  
  return insMap;
}

/**
 * 수술기록지(임플란트) 파싱
 */
export interface ImplantRecord {
  date: string;
  patientName: string;
  chartNumber: string;
  teethSet: Set<string>;
  quantity: number;
  supplier: string;
  productName: string;
  isInsurance: boolean;
}

export function parseSurgeryImplant(
  sheet: XLSX.WorkSheet,
  insMap: Map<string, string[]>
): ImplantRecord[] {
  const records: ImplantRecord[] = [];
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  // 헤더 제외하고 데이터 처리
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    
    const surgDate = row[0]; // A열: 날짜
    const rawPatient = String(row[1] || ''); // B열: 환자정보
    const rawTeeth = String(row[2] || ''); // C열: 치아번호
    const rawRecord = toHalfWidth(String(row[3] || '')); // D열: 수술기록
    
    if (!rawPatient) continue;
    
    // 환자 정보 파싱
    const { name, chartNumber } = parsePatientInfo(rawPatient);
    
    // 치아 범위 확장
    const teethSet = expandTeethRange(rawTeeth);
    const quantity = teethSet.size;
    
    // 날짜 포맷
    let dateStr = '';
    if (surgDate instanceof Date) {
      dateStr = formatDate(surgDate);
    } else if (typeof surgDate === 'string') {
      dateStr = surgDate;
    }
    
    // 보험 여부 확인
    const lookupKey = `${dateStr}|${chartNumber}`;
    const insTeeth = insMap.get(lookupKey) || [];
    const isInsurance = insTeeth.some((t) => teethSet.has(t));
    
    // 거래처명 결정
    let supplier = '';
    let isGBROnly = false;
    
    if (isInsurance) {
      supplier = '보험';
    } else if (rawRecord.includes('[GBR Only]')) {
      supplier = 'GBR Only';
      isGBROnly = true;
    } else {
      supplier = determineSupplier(rawRecord);
    }
    
    // GBR Only는 임플란트 레코드에서 제외
    if (isGBROnly) {
      continue;
    }
    
    // 품목명 추출
    const productName = extractProductName(rawRecord);
    
    records.push({
      date: dateStr,
      patientName: name,
      chartNumber,
      teethSet,
      quantity,
      supplier,
      productName,
      isInsurance
    });
  }
  
  return records;
}

/**
 * 수술기록지(뼈) 파싱
 */
export interface BoneGraftRecord {
  date: string;
  patientName: string;
  chartNumber: string;
  teethSet: Set<string>;
  products: Map<string, number>; // 품목명 -> 수량
}

export function parseSurgeryBone(sheet: XLSX.WorkSheet): BoneGraftRecord[] {
  const records: BoneGraftRecord[] = [];
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  // 헤더 제외하고 데이터 처리
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;
    
    const surgDate = row[0]; // A열: 날짜
    const rawPatient = String(row[1] || ''); // B열: 환자정보
    const rawTeeth = String(row[2] || ''); // C열: 치아번호
    const rawRecord = String(row[3] || ''); // D열: 수술기록
    
    if (!rawPatient) continue;
    
    // 환자 정보 파싱
    const { name, chartNumber } = parsePatientInfo(rawPatient);
    
    // 치아 범위 확장
    const teethSet = expandTeethRange(rawTeeth);
    
    // 날짜 포맷
    let dateStr = '';
    if (surgDate instanceof Date) {
      dateStr = formatDate(surgDate);
    } else if (typeof surgDate === 'string') {
      dateStr = surgDate;
    }
    
    // 동종골 품목명 추출
    const products = extractBoneGraftProducts(rawRecord);
    
    if (products.size > 0) {
      records.push({
        date: dateStr,
        patientName: name,
        chartNumber,
        teethSet,
        products
      });
    }
  }
  
  return records;
}
