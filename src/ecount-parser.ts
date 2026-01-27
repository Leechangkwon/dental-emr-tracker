import * as XLSX from 'xlsx';
import { EcountProduct } from './types';

/**
 * 이카운트 엑셀/CSV 파싱
 * 필요한 컬럼만 추출: 구매처명, 이미지, 대분류, 중분류, 소분류, 품목코드, 품목명, 규격, 단위, 입고단가, 당수량(분자), 당수량(분모)
 */
export function parseEcountProducts(sheet: XLSX.WorkSheet): EcountProduct[] {
  const products: EcountProduct[] = [];
  
  const data = XLSX.utils.sheet_to_json(sheet, { 
    header: 1,
    defval: '', // 빈 셀을 빈 문자열로
    blankrows: false // 빈 행 건너뛰기
  }) as any[][];
  
  if (data.length < 2) {
    return products; // 헤더만 있거나 데이터 없음
  }
  
  // 헤더 행에서 컬럼 인덱스 찾기 (공백 및 특수문자 제거)
  const headers = data[0].map((h: any) => cleanString(String(h || '')));
  
  const colMap: Record<string, number> = {};
  const columnNames = [
    '구매처명',
    '이미지',
    '대분류',
    '중분류',
    '소분류',
    '품목코드',
    '품목명',
    '규격',
    '단위',
    '입고단가',
    '당수량(분자)',
    '당수량(분모)'
  ];
  
  // 컬럼명 매칭 (완전 일치 또는 부분 일치)
  columnNames.forEach(name => {
    let idx = headers.indexOf(name);
    
    // 완전 일치 실패 시 부분 일치 시도
    if (idx === -1) {
      idx = headers.findIndex(h => h.includes(name) || name.includes(h));
    }
    
    if (idx !== -1) {
      colMap[name] = idx;
    }
  });
  
  // 데이터 행 처리
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // 빈 행 건너뛰기
    if (!row || row.length === 0) continue;
    
    // 모든 셀이 비어있으면 건너뛰기
    const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasData) continue;
    
    // 품목명은 필수
    const productName = colMap['품목명'] !== undefined 
      ? cleanString(String(row[colMap['품목명']] || ''))
      : '';
    
    if (!productName) continue;
    
    // 데이터 정리 및 생성
    const product: EcountProduct = {
      supplier_name: colMap['구매처명'] !== undefined 
        ? cleanString(String(row[colMap['구매처명']] || '')) || undefined
        : undefined,
      image_url: colMap['이미지'] !== undefined 
        ? cleanString(String(row[colMap['이미지']] || '')) || undefined
        : undefined,
      category_large: colMap['대분류'] !== undefined 
        ? cleanString(String(row[colMap['대분류']] || '')) || undefined
        : undefined,
      category_medium: colMap['중분류'] !== undefined 
        ? cleanString(String(row[colMap['중분류']] || '')) || undefined
        : undefined,
      category_small: colMap['소분류'] !== undefined 
        ? cleanString(String(row[colMap['소분류']] || '')) || undefined
        : undefined,
      product_code: colMap['품목코드'] !== undefined 
        ? cleanString(String(row[colMap['품목코드']] || '')) || undefined
        : undefined,
      product_name: productName,
      specification: colMap['규격'] !== undefined 
        ? cleanString(String(row[colMap['규격']] || '')) || undefined
        : undefined,
      unit: colMap['단위'] !== undefined 
        ? cleanString(String(row[colMap['단위']] || '')) || undefined
        : undefined,
      unit_price: colMap['입고단가'] !== undefined 
        ? parseNumber(row[colMap['입고단가']])
        : 0,
      quantity_numerator: colMap['당수량(분자)'] !== undefined 
        ? parseNumber(row[colMap['당수량(분자)']]) || undefined
        : undefined,
      quantity_denominator: colMap['당수량(분모)'] !== undefined 
        ? parseNumber(row[colMap['당수량(분모)']]) || undefined
        : undefined
    };
    
    products.push(product);
  }
  
  return products;
}

/**
 * 문자열 정리: 공백, 특수문자, BOM 제거
 */
function cleanString(str: string): string {
  if (!str) return '';
  
  // BOM 제거
  str = str.replace(/^\uFEFF/, '');
  
  // 앞뒤 공백 제거
  str = str.trim();
  
  // 연속된 공백을 하나로
  str = str.replace(/\s+/g, ' ');
  
  // 특수 공백 문자 제거 (non-breaking space 등)
  str = str.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  
  return str;
}

/**
 * 숫자 파싱: 쉼표, 특수문자 제거
 */
function parseNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  // 문자열에서 숫자만 추출
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  
  return isNaN(num) ? 0 : num;
}

/**
 * CSV 파일 인코딩 감지 및 디코딩
 */
function decodeCSV(buffer: ArrayBuffer): string {
  // UTF-8 BOM 확인
  const uint8 = new Uint8Array(buffer);
  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    // UTF-8 BOM 있음
    return new TextDecoder('utf-8').decode(buffer.slice(3));
  }
  
  // UTF-8 시도
  try {
    const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    // UTF-8이 성공적으로 디코딩되면 반환
    return utf8Text;
  } catch (e) {
    // UTF-8 실패 시 EUC-KR 시도
    // EUC-KR은 브라우저에서 지원하지 않으므로 fallback
    console.warn('UTF-8 디코딩 실패, 기본 디코딩 사용');
    return new TextDecoder().decode(buffer);
  }
}

/**
 * 파일 버퍼에서 이카운트 데이터 파싱
 */
export async function parseEcountData(buffer: ArrayBuffer, fileName: string): Promise<EcountProduct[]> {
  let workbook: XLSX.WorkBook;
  
  const lowerName = fileName.toLowerCase();
  
  // CSV 파일인 경우
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    const text = decodeCSV(buffer);
    
    // XLSX 라이브러리로 CSV 파싱 (자동으로 쉼표, 따옴표 처리)
    workbook = XLSX.read(text, { 
      type: 'string',
      raw: false, // 타입 변환 활성화
      codepage: 949 // EUC-KR/CP949 지원
    });
  } else {
    // Excel 파일인 경우
    workbook = XLSX.read(buffer, {
      raw: false // 타입 변환 활성화
    });
  }
  
  // 첫 번째 시트 사용
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  return parseEcountProducts(sheet);
}
