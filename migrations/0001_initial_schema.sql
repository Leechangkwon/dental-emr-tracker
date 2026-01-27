-- 치료 기록 마스터 테이블
CREATE TABLE IF NOT EXISTS treatment_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_name TEXT NOT NULL,                 -- 지점명
  patient_name TEXT NOT NULL,                -- 환자명
  chart_number TEXT NOT NULL,                -- 차트번호
  tooth_number TEXT NOT NULL,                -- 치식 (예: #35, #37)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 뼈이식 (1단계)
CREATE TABLE IF NOT EXISTS bone_graft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_record_id INTEGER NOT NULL,
  date TEXT NOT NULL,                        -- 날짜 (YYYY-MM-DD)
  product_name TEXT,                         -- 품목명
  quantity INTEGER DEFAULT 0,                -- 수량
  amount REAL DEFAULT 0,                     -- 금액
  supplier TEXT,                             -- 거래처
  FOREIGN KEY (treatment_record_id) REFERENCES treatment_records(id) ON DELETE CASCADE
);

-- 임플란트 (2단계)
CREATE TABLE IF NOT EXISTS implant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_record_id INTEGER NOT NULL,
  date TEXT NOT NULL,                        -- 날짜 (YYYY-MM-DD)
  product_name TEXT,                         -- 품목명
  quantity INTEGER DEFAULT 0,                -- 수량
  amount REAL DEFAULT 0,                     -- 금액
  supplier TEXT,                             -- 거래처/보험 여부
  is_insurance BOOLEAN DEFAULT 0,            -- 보험 여부 (0: 일반, 1: 보험)
  FOREIGN KEY (treatment_record_id) REFERENCES treatment_records(id) ON DELETE CASCADE
);

-- 임시덴쳐 (3단계) - 향후 확장
CREATE TABLE IF NOT EXISTS temporary_denture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_record_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  product_name TEXT,
  quantity INTEGER DEFAULT 0,
  amount REAL DEFAULT 0,
  FOREIGN KEY (treatment_record_id) REFERENCES treatment_records(id) ON DELETE CASCADE
);

-- 보철교합 (4단계) - 향후 확장
CREATE TABLE IF NOT EXISTS prosthetic_occlusion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_record_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  product_name TEXT,
  quantity INTEGER DEFAULT 0,
  amount REAL DEFAULT 0,
  FOREIGN KEY (treatment_record_id) REFERENCES treatment_records(id) ON DELETE CASCADE
);

-- 보철완성 (5단계) - 향후 확장
CREATE TABLE IF NOT EXISTS prosthetic_completion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treatment_record_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  product_name TEXT,
  quantity INTEGER DEFAULT 0,
  amount REAL DEFAULT 0,
  FOREIGN KEY (treatment_record_id) REFERENCES treatment_records(id) ON DELETE CASCADE
);

-- 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_treatment_branch ON treatment_records(branch_name);
CREATE INDEX IF NOT EXISTS idx_treatment_patient ON treatment_records(patient_name);
CREATE INDEX IF NOT EXISTS idx_treatment_chart ON treatment_records(chart_number);
CREATE INDEX IF NOT EXISTS idx_treatment_tooth ON treatment_records(tooth_number);

CREATE INDEX IF NOT EXISTS idx_bone_treatment ON bone_graft(treatment_record_id);
CREATE INDEX IF NOT EXISTS idx_implant_treatment ON implant(treatment_record_id);
CREATE INDEX IF NOT EXISTS idx_denture_treatment ON temporary_denture(treatment_record_id);
CREATE INDEX IF NOT EXISTS idx_occlusion_treatment ON prosthetic_occlusion(treatment_record_id);
CREATE INDEX IF NOT EXISTS idx_completion_treatment ON prosthetic_completion(treatment_record_id);
