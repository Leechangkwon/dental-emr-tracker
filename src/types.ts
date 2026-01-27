// Cloudflare Bindings 타입
export type Bindings = {
  DB: D1Database;
}

// 치료 기록 타입
export interface TreatmentRecord {
  id?: number;
  branch_name: string;
  patient_name: string;
  chart_number: string;
  tooth_number: string;
  created_at?: string;
  updated_at?: string;
}

// 뼈이식 타입
export interface BoneGraft {
  id?: number;
  treatment_record_id: number;
  date: string;
  product_name?: string;
  quantity: number;
  amount: number;
  supplier?: string;
  reference_tooth?: string; // 참조 치식 (예: #26)
}

// 임플란트 타입
export interface Implant {
  id?: number;
  treatment_record_id: number;
  date: string;
  product_name?: string;
  quantity: number;
  amount: number;
  supplier?: string;
  is_insurance: boolean;
}

// 엑셀 업로드 응답 타입
export interface UploadResponse {
  success: boolean;
  message: string;
  recordsProcessed?: number;
  errors?: string[];
}

// 조회 필터 타입
export interface QueryFilter {
  branch_name?: string;
  patient_name?: string;
  chart_number?: string;
}

// 조회 결과 타입 (통합 뷰)
export interface TreatmentView {
  id: number;
  branch_name: string;
  patient_name: string;
  chart_number: string;
  tooth_number: string;
  bone_graft?: BoneGraft[];
  implant?: Implant[];
  created_at: string;
  updated_at: string;
}

// 이카운트 품목 타입
export interface EcountProduct {
  id?: number;
  supplier_name?: string;          // 구매처명
  image_url?: string;               // 이미지
  category_large?: string;          // 대분류
  category_medium?: string;         // 중분류
  category_small?: string;          // 소분류
  product_code?: string;            // 품목코드
  product_name: string;             // 품목명 (필수)
  specification?: string;           // 규격
  unit?: string;                    // 단위
  unit_price?: number;              // 입고단가
  quantity_numerator?: number;      // 당수량(분자)
  quantity_denominator?: number;    // 당수량(분모)
  created_at?: string;
  updated_at?: string;
}
