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
