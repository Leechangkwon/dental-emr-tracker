import * as XLSX from 'xlsx';
import { EcountProduct } from './types';

/**
 * 이카운트 엑셀/CSV 파싱
 * 필요한 컬럼만 추출: 구매처명, 이미지, 대분류, 중분류, 소분류, 품목코드, 품목명, 규격, 단위, 입고단가, 당수량(분자), 당수량(분모)
 */
export function parseEcountProducts(sheet: XLSX.WorkSheet): EcountProduct[] {
  const products: EcountProduct[] = [];
  
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  if (data.length < 2) {
    return products; // 헤더만 있거나 데이터 없음
  }
  
  // 헤더 행에서 컬럼 인덱스 찾기
  const headers = data[0].map((h: any) => String(h || '').trim());
  
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
  
  columnNames.forEach(name => {
    const idx = headers.indexOf(name);
    if (idx !== -1) {
      colMap[name] = idx;
    }
  });
  
  // 데이터 행 처리
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    // 품목명은 필수
    const productName = colMap['품목명'] !== undefined ? String(row[colMap['품목명']] || '').trim() : '';
    if (!productName) continue;
    
    const product: EcountProduct = {
      supplier_name: colMap['구매처명'] !== undefined ? String(row[colMap['구매처명']] || '').trim() : undefined,
      image_url: colMap['이미지'] !== undefined ? String(row[colMap['이미지']] || '').trim() : undefined,
      category_large: colMap['대분류'] !== undefined ? String(row[colMap['대분류']] || '').trim() : undefined,
      category_medium: colMap['중분류'] !== undefined ? String(row[colMap['중분류']] || '').trim() : undefined,
      category_small: colMap['소분류'] !== undefined ? String(row[colMap['소분류']] || '').trim() : undefined,
      product_code: colMap['품목코드'] !== undefined ? String(row[colMap['품목코드']] || '').trim() : undefined,
      product_name: productName,
      specification: colMap['규격'] !== undefined ? String(row[colMap['규격']] || '').trim() : undefined,
      unit: colMap['단위'] !== undefined ? String(row[colMap['단위']] || '').trim() : undefined,
      unit_price: colMap['입고단가'] !== undefined ? parseFloat(row[colMap['입고단가']] || 0) : 0,
      quantity_numerator: colMap['당수량(분자)'] !== undefined ? parseInt(row[colMap['당수량(분자)']] || 0) : undefined,
      quantity_denominator: colMap['당수량(분모)'] !== undefined ? parseInt(row[colMap['당수량(분모)']] || 0) : undefined
    };
    
    products.push(product);
  }
  
  return products;
}
