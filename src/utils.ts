/**
 * 치과 EMR 엑셀 데이터 파싱 유틸리티
 */

// 전각 문자를 반각으로 변환
export function toHalfWidth(str: string): string {
  return str
    .replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

// 환자 정보에서 이름과 차트번호 분리
export function parsePatientInfo(rawPatient: string): { name: string; chartNumber: string } {
  const firstDigitIdx = rawPatient.search(/\d/);
  
  if (firstDigitIdx !== -1) {
    const name = rawPatient.substring(0, firstDigitIdx).replace(/[()]/g, '').trim();
    const chartNumber = rawPatient.substring(firstDigitIdx).replace(/[()]/g, '').trim();
    return { name, chartNumber };
  }
  
  return { name: rawPatient, chartNumber: '' };
}

// 치아번호 범위를 개별 치아로 확장 (FDI 표기법)
const upperArch = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
const lowerArch = ['38', '37', '36', '35', '34', '33', '32', '31', '41', '42', '43', '44', '45', '46', '47', '48'];

export function expandTeethRange(rawTeeth: string): Set<string> {
  const teethSet = new Set<string>();
  
  if (!rawTeeth) return teethSet;
  
  const segments = rawTeeth.replace(/\s/g, '').split(',');
  
  segments.forEach((seg) => {
    if (seg.includes('~')) {
      // 범위 표기 (예: #35~37)
      const parts = seg.split('~').map((s) => s.replace('#', '').trim());
      const arch = upperArch.includes(parts[0]) ? upperArch : 
                   (lowerArch.includes(parts[0]) ? lowerArch : null);
      
      if (arch) {
        const startIdx = arch.indexOf(parts[0]);
        const endIdx = arch.indexOf(parts[1]);
        
        for (let j = Math.min(startIdx, endIdx); j <= Math.max(startIdx, endIdx); j++) {
          teethSet.add(arch[j]);
        }
      }
    } else {
      // 개별 치아
      const tooth = seg.replace('#', '').trim();
      if (tooth) teethSet.add(tooth);
    }
  });
  
  return teethSet;
}

// 날짜 포맷 변환 (Date -> YYYY-MM-DD)
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') return date;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// 거래처 매핑
export const VENDOR_MAP: Record<string, string> = {
  'IZENOSS': 'IZEN',
  'TITAN BONE': '비오케이',
  'Allobone': '씨지바이오',
  'PUREROS': '푸어로스',
  '이젠임플란트(주)': '주식회사 메타약품_의료기기팀',
  'IZEN': '주식회사 메타약품_의료기기팀',
  'PLAN': '주식회사 메타약품_의료기기팀',
  'OSSTEM': '오스템임플란트 주식회사',
  '메가젠': '(주)메가젠임플란트',
  'Megagen': '(주)메가젠임플란트',
  'Straumann': '스트라우만'
};

// 거래처명 결정
export function determineSupplier(content: string, vendorMap: Record<string, string> = VENDOR_MAP): string {
  for (const [key, value] of Object.entries(vendorMap)) {
    if (content.includes(key)) {
      return value;
    }
  }
  
  // 첫 번째 " - " 앞부분을 거래처로 사용
  const vendorKey = content.split(' - ')[0].trim();
  return vendorMap[vendorKey] || vendorKey;
}

// 품목명 추출 및 정리
export function extractProductName(rawRecord: string): string {
  const productPart = rawRecord.split('/')[0].trim();
  let cleanProduct = productPart;
  
  if (productPart.includes(' - ')) {
    cleanProduct = productPart.split(' - ').slice(1).join(' - ').trim();
  }
  
  // 사이즈 표기 정리 (Φ 5.0 x 10 -> 510)
  const sizeMatch = cleanProduct.match(/Φ\s*(\d+\.?\d*)\s*[*×x]\s*(\d+\.?\d*)/);
  if (sizeMatch) {
    const dia = Math.round(parseFloat(sizeMatch[1]) * 10).toString();
    const len = Math.floor(parseFloat(sizeMatch[2])).toString().padStart(2, '0');
    return cleanProduct.replace(sizeMatch[0], '').trim() + ' ' + dia + len;
  }
  
  return cleanProduct;
}

// 동종골 품목명 추출 (동) 다음부터 쉼표나 슬래시 전까지
export function extractBoneGraftProducts(content: string): Map<string, number> {
  const boneRegex = /\(동\)\s*([^,\/]+)/g;
  const boneCounts = new Map<string, number>();
  let match;
  
  while ((match = boneRegex.exec(content)) !== null) {
    const itemName = match[1].trim();
    if (itemName) {
      boneCounts.set(itemName, (boneCounts.get(itemName) || 0) + 1);
    }
  }
  
  return boneCounts;
}
