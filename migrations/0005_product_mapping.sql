-- 매핑 테이블: DB 품목명과 지점별 품목코드 매핑
CREATE TABLE IF NOT EXISTS product_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT UNIQUE NOT NULL,
  branch_codes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
