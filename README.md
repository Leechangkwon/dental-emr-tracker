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
   - 수술기록지 시트 처리 (동종골 + 임플란트 통합)
   - 급여 임플란트 시트 처리 (보험 매칭)
   - **GBR Only 제외**: 임플란트 레코드에서 GBR Only는 저장하지 않음

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
   - **날짜 범위 필터** (시작일~종료일)
   - **품목군(거래처) 필터** (예: IZEN, 오스템)
   - **품목명 필터** (예: IZENOSS, TS III)
   - 치아별 상세 정보 표시

5. **데이터 편집 기능**
   - **레코드 삭제**: 치료 기록 전체 삭제
   - 뼈이식/임플란트 개별 수정 API (향후 UI 추가 예정)

6. **프론트엔드 UI**
   - 직관적인 업로드 인터페이스
   - 고급 필터링 UI (7개 필터 옵션)
   - 실시간 데이터 조회
   - 치료 단계별 정보 테이블 표시
   - 삭제 버튼 (각 레코드별)

### 🚧 향후 구현 예정
- **편집 UI**: 뼈이식/임플란트 데이터 직접 수정 인터페이스
- 임시덴쳐 데이터 처리
- 보철교합 데이터 처리
- 보철완성 데이터 처리
- 금액 데이터 입력 및 집계
- 데이터 시각화 (차트, 그래프)
- 통계 및 리포트 기능
- 엑셀 내보내기 기능
- 일괄 편집 기능

## 📝 사용 방법

### 1. 데이터 업로드
1. 지점명 입력 (필수)
2. 엑셀 파일 선택:
   - **수술기록지 파일**: '수술기록지' 시트 포함 (동종골 및 임플란트 데이터 통합)
   - **급여 임플란트 파일**: '급여 임플란트' 시트 포함
3. "업로드 및 저장" 버튼 클릭

### 2. 데이터 조회
1. 필터 조건 입력 (선택):
   - 지점명 (완전 일치)
   - 환자명 (부분 일치)
   - 차트번호 (완전 일치)
   - 시작 날짜 ~ 종료 날짜
   - 품목군 (거래처명, 예: IZEN, 오스템)
   - 품목명 (예: IZENOSS, TS III)
2. "조회" 버튼 클릭
3. 테이블에서 결과 확인

### 3. 데이터 삭제
1. 조회 결과 테이블에서 삭제할 레코드의 "삭제" 버튼 클릭
2. 확인 메시지에서 "확인" 클릭
3. 레코드 삭제 완료 (관련된 뼈이식/임플란트 데이터도 자동 삭제)

### 엑셀 양식

#### 수술기록지
- A열: 날짜 (YYYY-MM-DD)
- B열: 환자정보 (이름(차트번호))
- C열: 치아번호 (#35,37 또는 #35~37)
- D열: 수술기록
  - 임플란트: 거래처 - 품목명 / 기타정보
  - 동종골: (동) 품목명 포함

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
- **Query**: 
  - branch_name (지점명)
  - patient_name (환자명, 부분 일치)
  - chart_number (차트번호)
  - start_date (시작 날짜, YYYY-MM-DD)
  - end_date (종료 날짜, YYYY-MM-DD)
  - supplier (품목군/거래처, 부분 일치)
  - product_name (품목명, 부분 일치)
- **Response**: { success, data[], count }

### DELETE /api/records/:id
치료 기록 삭제
- **Param**: id (레코드 ID)
- **Response**: { success, message }

### PUT /api/bone-graft/:id
뼈이식 데이터 수정
- **Param**: id
- **Body**: { date, product_name, quantity, supplier }
- **Response**: { success, message }

### PUT /api/implant/:id
임플란트 데이터 수정
- **Param**: id
- **Body**: { date, product_name, quantity, supplier, is_insurance }
- **Response**: { success, message }

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
  
- **2026-01-27 (v2)**: 고급 기능 추가
  - GBR Only 임플란트 레코드 제외
  - 날짜/품목군/품목명 필터 추가
  - 레코드 삭제 기능 구현
  - 수정 API 추가 (UI는 향후)

## 📞 지원

문의사항이나 버그 리포트는 GitHub Issues를 통해 남겨주세요.

---

**Status**: ✅ 개발 완료 (1-2단계)  
**Last Updated**: 2026-01-27
