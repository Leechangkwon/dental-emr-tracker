-- 이카운트 품목 테이블
CREATE TABLE IF NOT EXISTS ecount_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT,              -- 구매처명
  image_url TEXT,                  -- 이미지
  category_large TEXT,             -- 대분류
  category_medium TEXT,            -- 중분류
  category_small TEXT,             -- 소분류
  product_code TEXT UNIQUE,        -- 품목코드
  product_name TEXT NOT NULL,      -- 품목명
  specification TEXT,              -- 규격
  unit TEXT,                       -- 단위
  unit_price REAL DEFAULT 0,       -- 입고단가
  quantity_numerator INTEGER,      -- 당수량(분자)
  quantity_denominator INTEGER,    -- 당수량(분모)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 품목코드 인덱스
CREATE INDEX IF NOT EXISTS idx_ecount_product_code ON ecount_products(product_code);

-- 품목명 인덱스
CREATE INDEX IF NOT EXISTS idx_ecount_product_name ON ecount_products(product_name);

-- 구매처명 인덱스
CREATE INDEX IF NOT EXISTS idx_ecount_supplier ON ecount_products(supplier_name);
