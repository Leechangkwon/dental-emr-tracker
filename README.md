# 치과 EMR 추적 시스템

치과 병원의 EMR 데이터를 기반으로 동종골, 임플란트, 기공료를 추적 관리하는 시스템입니다.

## 프로젝트 개요

- **이름**: 치과 EMR 추적 시스템
- **목적**: 치과 재료 사용 추적 및 치료 단계별 관리
- **주요 기능**: 엑셀 데이터 업로드, 자동 파싱, D1 데이터베이스 저장, 필터링 조회

## 🌐 URL

- **개발 서버**: https://3000-i37uy0saj0poadfwjv784-c81df28e.sandbox.novita.ai
- **GitHub**: (추후 추가)

## 📊 데이터 구조

### 치료 단계
1. **1단계 - 동종골 (뼈이식)**: 뼈이식 재료 사용 기록
2. **2단계 - 임플란트**: 임플란트 식립 기록 (보험/일반 구분)
3. **3단계 - 임시덴쳐**: (향후 구현 예정)
4. **4단계 - 보철교합**: (향후 구현 예정)
5. **5단계 - 보철완성**: (향후 구현 예정)

### 데이터베이스 테이블

#### treatment_records (치료 기록 마스터)
- id, branch_name, patient_name, chart_number, tooth_number
- 환자별, 치아별 치료 기록의 기본 정보

#### bone_graft (동종골)
- treatment_record_id, date, product_name, quantity, amount, supplier
- 뼈이식 재료 사용 내역

#### implant (임플란트)
- treatment_record_id, date, product_name, quantity, amount, supplier, is_insurance
- 임플란트 식립 내역 (보험 여부 포함)

### 저장 서비스
- **Cloudflare D1**: SQLite 기반 관계형 데이터베이스

## 🔧 기능 구현 현황

### ✅ 완료된 기능
1. **엑셀 파일 업로드**
   - 수술기록지(임플란트) 시트 처리
   - 수술기록지(뼈) 시트 처리
   - 급여 임플란트 시트 처리 (보험 매칭)

2. **데이터 파싱 및 재정리**
   - 환자명/차트번호 자동 분리
   - 치아번호 범위 확장 (예: #35~37 → #35, #36, #37)
   - 동종골 품목명 추출 (동) 마커 기반
   - 임플란트 거래처/보험 자동 판별
   - 품목명 정리 및 사이즈 표기 변환

3. **D1 데이터베이스 저장**
   - 치아별 개별 레코드 생성
   - 치료 단계별 데이터 분리 저장
   - 트랜잭션 처리

4. **데이터 조회 및 필터링**
   - 지점명 필터
   - 환자명 검색 (부분 일치)
   - 차트번호 필터
   - 치아별 상세 정보 표시

5. **프론트엔드 UI**
   - 직관적인 업로드 인터페이스
   - 실시간 데이터 조회
   - 치료 단계별 정보 테이블 표시

### 🚧 향후 구현 예정
- 임시덴쳐 데이터 처리
- 보철교합 데이터 처리
- 보철완성 데이터 처리
- 금액 데이터 입력 및 집계
- 데이터 시각화 (차트, 그래프)
- 통계 및 리포트 기능
- 엑셀 내보내기 기능

## 📝 사용 방법

### 1. 데이터 업로드
1. 지점명 입력 (필수)
2. 엑셀 파일 선택:
   - **수술기록지 파일**: '수술기록지(임플란트)', '수술기록지(뼈)' 시트 포함
   - **급여 임플란트 파일**: '급여 임플란트' 시트 포함
3. "업로드 및 저장" 버튼 클릭

### 2. 데이터 조회
1. 필터 조건 입력 (선택):
   - 지점명 (완전 일치)
   - 환자명 (부분 일치)
   - 차트번호 (완전 일치)
2. "조회" 버튼 클릭
3. 테이블에서 결과 확인

### 엑셀 양식

#### 수술기록지(임플란트)
- A열: 날짜 (YYYY-MM-DD)
- B열: 환자정보 (이름(차트번호))
- C열: 치아번호 (#35,37 또는 #35~37)
- D열: 수술기록 (거래처 - 품목명 / 기타정보)

#### 수술기록지(뼈)
- A열: 날짜
- B열: 환자정보
- C열: 치아번호
- D열: 수술기록 ((동) 품목명 포함)

#### 급여 임플란트
- A열: 환자정보
- B열: 치식
- C열: 1단계 날짜
- D열: 2단계 날짜
- E열: 3단계 날짜

## 🛠 기술 스택

- **프레임워크**: Hono (Cloudflare Workers)
- **데이터베이스**: Cloudflare D1 (SQLite)
- **프론트엔드**: Vanilla JS + TailwindCSS + Axios
- **엑셀 처리**: xlsx (SheetJS)
- **배포**: Cloudflare Pages

## 🚀 로컬 개발

### 요구사항
- Node.js 18+
- npm

### 설치 및 실행
```bash
# 의존성 설치
npm install

# 데이터베이스 마이그레이션
npm run db:migrate:local

# 빌드
npm run build

# PM2로 개발 서버 시작
pm2 start ecosystem.config.cjs

# 서버 상태 확인
pm2 list

# 로그 확인
pm2 logs webapp --nostream
```

## 📦 배포

### Cloudflare Pages 배포
```bash
# 빌드
npm run build

# 배포 (API 토큰 필요)
npm run deploy
```

## 🔍 API 엔드포인트

### POST /api/upload
엑셀 파일 업로드 및 저장
- **Body**: FormData (branchName, surgeryFile, insuranceFile)
- **Response**: { success, message, recordsProcessed }

### GET /api/records
치료 기록 조회
- **Query**: branch_name, patient_name, chart_number
- **Response**: { success, data[], count }

### GET /api/branches
지점 목록 조회
- **Response**: { success, data[] }

### DELETE /api/reset
데이터베이스 초기화 (개발용)
- **Response**: { success, message }

## 📊 데이터 처리 로직

### 임플란트 처리
1. 환자정보에서 이름과 차트번호 분리
2. 치아번호 범위를 개별 치아로 확장
3. 급여 임플란트 시트와 날짜/차트번호/치아 매칭하여 보험 여부 판별
4. GBR Only 또는 일반 거래처 구분
5. 품목명에서 사이즈 정보 추출 및 표준화

### 동종골 처리
1. 수술기록에서 "(동)" 마커 검색
2. 쉼표(,) 또는 슬래시(/) 전까지의 품목명 추출
3. 동일 품목이 여러 번 나오면 수량 집계
4. 품목명 기반 거래처 자동 매핑

## 📅 업데이트 기록

- **2026-01-27**: 초기 버전 구현
  - D1 데이터베이스 설계
  - 동종골, 임플란트 데이터 처리
  - 업로드 및 조회 기능 구현
  - 프론트엔드 UI 개발

## 📞 지원

문의사항이나 버그 리포트는 GitHub Issues를 통해 남겨주세요.

---

**Status**: ✅ 개발 완료 (1-2단계)  
**Last Updated**: 2026-01-27
