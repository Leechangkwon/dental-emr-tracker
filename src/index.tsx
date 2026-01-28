import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import * as XLSX from 'xlsx'

// Types
import type { Bindings } from './types'

// Parsers
import { parseInsuranceData, parseSurgeryImplant, parseSurgeryBone } from './parser'

// Database functions
import { 
  saveImplantRecords, 
  saveBoneGraftRecords,
  queryTreatmentRecords,
  deleteTreatmentRecord,
  deleteTreatmentRecordsBatch,
  updateBoneGraft,
  updateImplant
} from './database'

// Ecount functions
import { parseEcountData } from './ecount-parser'
import {
  saveEcountProducts,
  queryEcountProducts,
  deleteEcountProduct
} from './ecount-db'

const app = new Hono<{ Bindings: Bindings }>()

// CORS 설정
app.use('/api/*', cors())

// 정적 파일 제공
app.use('/static/*', serveStatic({ root: './public' }))

// ===== EMR API 엔드포인트 =====

// 엑셀 파일 업로드 및 처리 API
app.post('/api/upload', async (c) => {
  try {
    const db = c.env.DB
    const formData = await c.req.formData()
    
    const branchName = formData.get('branchName') as string
    const surgeryFile = formData.get('surgeryFile') as File | null
    const insuranceFile = formData.get('insuranceFile') as File | null
    
    if (!branchName) {
      return c.json({ success: false, message: '지점명을 입력해주세요.' }, 400)
    }
    
    let totalRecords = 0
    const errors: string[] = []
    
    // 보험 파일 처리
    let insMap = new Map<string, string[]>()
    if (insuranceFile) {
      try {
        const insBuffer = await insuranceFile.arrayBuffer()
        const insWorkbook = XLSX.read(insBuffer)
        const insSheet = insWorkbook.Sheets['급여 임플란트']
        
        if (insSheet) {
          insMap = parseInsuranceData(insSheet)
        } else {
          errors.push("'급여 임플란트' 시트를 찾을 수 없습니다.")
        }
      } catch (err) {
        errors.push(`보험 파일 처리 중 오류: ${err}`)
      }
    }
    
    // 수술기록지 처리
    if (surgeryFile) {
      try {
        const buffer = await surgeryFile.arrayBuffer()
        const workbook = XLSX.read(buffer)
        const sheet = workbook.Sheets['수술기록지']
        
        if (!sheet) {
          errors.push("'수술기록지' 시트를 찾을 수 없습니다.")
        } else {
          // 임플란트 데이터
          const implantRecords = parseSurgeryImplant(sheet, insMap)
          const implantCount = await saveImplantRecords(db, branchName, implantRecords)
          totalRecords += implantCount
          
          // 동종골 데이터
          const boneRecords = parseSurgeryBone(sheet)
          const boneCount = await saveBoneGraftRecords(db, branchName, boneRecords)
          totalRecords += boneCount
        }
      } catch (err) {
        errors.push(`수술기록지 처리 중 오류: ${err}`)
      }
    }
    
    if (errors.length > 0) {
      return c.json({
        success: false,
        message: '일부 데이터 처리 중 오류가 발생했습니다.',
        recordsProcessed: totalRecords,
        errors
      }, 400)
    }
    
    return c.json({
      success: true,
      message: `총 ${totalRecords}건의 레코드가 처리되었습니다.`,
      recordsProcessed: totalRecords
    })
  } catch (err) {
    console.error('Upload error:', err)
    return c.json({ 
      success: false, 
      message: `업로드 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 치료 기록 조회 API
app.get('/api/records', async (c) => {
  try {
    const db = c.env.DB
    const branchName = c.req.query('branch_name')
    const patientName = c.req.query('patient_name')
    const chartNumber = c.req.query('chart_number')
    const startDate = c.req.query('start_date')
    const endDate = c.req.query('end_date')
    const supplier = c.req.query('supplier')
    const productName = c.req.query('product_name')
    
    const records = await queryTreatmentRecords(
      db, 
      branchName, 
      patientName, 
      chartNumber,
      startDate,
      endDate,
      supplier,
      productName
    )
    
    return c.json({
      success: true,
      count: records.length,
      data: records
    })
  } catch (err) {
    console.error('Query error:', err)
    return c.json({ 
      success: false, 
      message: `조회 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 치료 기록 삭제 API
app.delete('/api/records/:id', async (c) => {
  try {
    const db = c.env.DB
    const recordId = parseInt(c.req.param('id'))
    
    const success = await deleteTreatmentRecord(db, recordId)
    
    if (success) {
      return c.json({ success: true, message: '레코드가 삭제되었습니다.' })
    } else {
      return c.json({ success: false, message: '삭제에 실패했습니다.' }, 400)
    }
  } catch (err) {
    console.error('Delete error:', err)
    return c.json({ 
      success: false, 
      message: `삭제 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 치료 기록 일괄 삭제 API
app.post('/api/records/batch-delete', async (c) => {
  try {
    const db = c.env.DB
    const { record_ids } = await c.req.json()
    
    if (!Array.isArray(record_ids) || record_ids.length === 0) {
      return c.json({ 
        success: false, 
        message: '삭제할 레코드 ID를 제공해주세요.' 
      }, 400)
    }
    
    const result = await deleteTreatmentRecordsBatch(db, record_ids)
    
    return c.json({
      success: true,
      message: `${result.deleted}건 삭제 성공, ${result.failed}건 실패`,
      deleted: result.deleted,
      failed: result.failed
    })
  } catch (err) {
    console.error('Batch delete error:', err)
    return c.json({ 
      success: false, 
      message: `일괄 삭제 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 동종골 데이터 수정 API
app.put('/api/bone-graft/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = parseInt(c.req.param('id'))
    const { date, product_name, quantity, supplier } = await c.req.json()
    
    const success = await updateBoneGraft(db, id, { date, product_name, quantity, supplier })
    
    if (success) {
      return c.json({ success: true, message: '뼈이식 데이터가 수정되었습니다.' })
    } else {
      return c.json({ success: false, message: '수정에 실패했습니다.' }, 400)
    }
  } catch (err) {
    console.error('Update error:', err)
    return c.json({ 
      success: false, 
      message: `수정 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 임플란트 데이터 수정 API
app.put('/api/implant/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = parseInt(c.req.param('id'))
    const { date, product_name, quantity, supplier, is_insurance } = await c.req.json()
    
    const success = await updateImplant(db, id, { date, product_name, quantity, supplier, is_insurance })
    
    if (success) {
      return c.json({ success: true, message: '임플란트 데이터가 수정되었습니다.' })
    } else {
      return c.json({ success: false, message: '수정에 실패했습니다.' }, 400)
    }
  } catch (err) {
    console.error('Update error:', err)
    return c.json({ 
      success: false, 
      message: `수정 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 지점명 목록 조회 API
app.get('/api/branches', async (c) => {
  try {
    const db = c.env.DB
    
    const result = await db.prepare(`
      SELECT DISTINCT branch_name 
      FROM treatment_records 
      ORDER BY branch_name
    `).all()
    
    return c.json({
      success: true,
      branches: result.results.map(r => r.branch_name)
    })
  } catch (err) {
    console.error('Branches query error:', err)
    return c.json({ 
      success: false, 
      message: `지점 목록 조회 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// ===== 이카운트 API 엔드포인트 =====

// 이카운트 품목 업로드 API
app.post('/api/ecount/upload', async (c) => {
  try {
    const db = c.env.DB
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    
    if (!file) {
      return c.json({ success: false, message: '파일을 선택해주세요.' }, 400)
    }
    
    const buffer = await file.arrayBuffer()
    const products = await parseEcountData(buffer, file.name)
    
    if (products.length === 0) {
      return c.json({ 
        success: false, 
        message: '파일에서 품목 데이터를 찾을 수 없습니다.' 
      }, 400)
    }
    
    const count = await saveEcountProducts(db, products)
    
    return c.json({
      success: true,
      message: `${count}건의 품목이 저장되었습니다.`,
      count
    })
  } catch (err) {
    console.error('Ecount upload error:', err)
    return c.json({ 
      success: false, 
      message: `업로드 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 이카운트 품목 조회 API
app.get('/api/ecount/products', async (c) => {
  try {
    const db = c.env.DB
    const supplierName = c.req.query('supplier_name')
    const categoryLarge = c.req.query('category_large')
    const categoryMedium = c.req.query('category_medium')
    const categorySmall = c.req.query('category_small')
    const productCode = c.req.query('product_code')
    const productName = c.req.query('product_name')
    const page = parseInt(c.req.query('page') || '1')
    const pageSize = parseInt(c.req.query('page_size') || '100')
    
    const result = await queryEcountProducts(db, {
      supplierName,
      categoryLarge,
      categoryMedium,
      categorySmall,
      productCode,
      productName,
      page,
      pageSize
    })
    
    return c.json({
      success: true,
      ...result
    })
  } catch (err) {
    console.error('Ecount query error:', err)
    return c.json({ 
      success: false, 
      message: `조회 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// 이카운트 품목 삭제 API
app.delete('/api/ecount/products/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = parseInt(c.req.param('id'))
    
    const success = await deleteEcountProduct(db, id)
    
    if (success) {
      return c.json({ success: true, message: '품목이 삭제되었습니다.' })
    } else {
      return c.json({ success: false, message: '삭제에 실패했습니다.' }, 400)
    }
  } catch (err) {
    console.error('Ecount delete error:', err)
    return c.json({ 
      success: false, 
      message: `삭제 중 오류가 발생했습니다: ${err}` 
    }, 500)
  }
})

// ===== 메인 페이지 =====
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>치과 관리 시스템</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50">
    <div class="min-h-screen flex flex-col">
        <!-- 헤더 -->
        <header class="bg-blue-600 text-white shadow-lg">
            <div class="container mx-auto px-4 py-6">
                <h1 class="text-3xl font-bold">
                    <i class="fas fa-tooth mr-3"></i>
                    치과 관리 시스템
                </h1>
                <p class="text-blue-100 mt-2">EMR 추적 및 이카운트 품목 관리</p>
            </div>
        </header>

        <div class="flex flex-1">
            <!-- 좌측 메뉴 -->
            <aside class="w-64 bg-white shadow-md">
                <nav class="p-4 space-y-2">
                    <button id="menuEmr" class="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors bg-blue-100 text-blue-700 font-medium">
                        <i class="fas fa-hospital mr-2"></i>
                        치과 EMR 추적
                    </button>
                    <button id="menuEcount" class="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700">
                        <i class="fas fa-box mr-2"></i>
                        이카운트 품목 관리
                    </button>
                    <button id="menuMapping" class="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors text-gray-700">
                        <i class="fas fa-table mr-2"></i>
                        매핑 테이블 관리
                    </button>
                </nav>
            </aside>

            <!-- 메인 컨텐츠 -->
            <main class="flex-1 p-8">
                <!-- EMR 섹션 -->
                <div id="emrSection">
                    <!-- 업로드 및 저장 -->
                    <div class="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-upload mr-2"></i>
                            데이터 업로드
                        </h2>
                        
                        <form id="uploadForm" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    지점명 <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="branchName" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 수원" required>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    수술기록지 파일
                                </label>
                                <input type="file" id="surgeryFile" accept=".xlsx,.xls"
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <p class="text-sm text-gray-500 mt-1">
                                    '수술기록지' 시트 포함 (.xlsx, .xls)
                                </p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    급여 임플란트 파일
                                </label>
                                <input type="file" id="insuranceFile" accept=".xlsx,.xls"
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <p class="text-sm text-gray-500 mt-1">
                                    '급여 임플란트' 시트 포함 (.xlsx, .xls)
                                </p>
                            </div>

                            <button type="submit" 
                                    class="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                                <i class="fas fa-cloud-upload-alt mr-2"></i>
                                업로드 및 저장
                            </button>
                        </form>

                        <div id="uploadResult" class="mt-4 hidden"></div>
                    </div>

                    <!-- 데이터 조회 -->
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-search mr-2"></i>
                            데이터 조회
                        </h2>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">지점명</label>
                                <input type="text" id="filterBranch" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 수원">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">환자명</label>
                                <input type="text" id="filterPatient" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 홍길동">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">차트번호</label>
                                <input type="text" id="filterChart" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 12345">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">시작 날짜</label>
                                <input type="date" id="filterStartDate" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">종료 날짜</label>
                                <input type="date" id="filterEndDate" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">품목군 (거래처)</label>
                                <input type="text" id="filterSupplier" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: IZEN">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">품목명</label>
                                <input type="text" id="filterProductName" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: IZENOSS">
                            </div>
                        </div>

                        <button id="searchBtn" 
                                class="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors mb-4">
                            <i class="fas fa-search mr-2"></i>
                            조회
                        </button>

                        <div class="mb-2 text-sm text-gray-600">
                            조회 결과: <span id="recordCount" class="font-bold">0</span>건
                        </div>

                        <div class="flex space-x-4 mb-4">
                            <button id="deleteAllBtn" 
                                    class="hidden bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors">
                                <i class="fas fa-trash mr-2"></i>
                                선택 삭제 (<span id="emrSelectedCount">0</span>)
                            </button>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-white border border-gray-300">
                                <thead class="bg-gray-100">
                                    <tr>
                                        <th class="px-4 py-3 border-b text-center text-sm font-semibold text-gray-700">
                                            <input type="checkbox" id="selectAllEmr" class="w-4 h-4 cursor-pointer">
                                        </th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">지점</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">환자명</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">차트번호</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">치식</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">
                                            뼈이식 <span id="boneTotal" class="text-blue-600"></span>
                                        </th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">
                                            임플란트 <span id="implantTotal" class="text-blue-600"></span>
                                        </th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">등록일</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">액션</th>
                                    </tr>
                                </thead>
                                <tbody id="resultTableBody">
                                    <tr>
                                        <td colspan="9" class="px-4 py-8 text-center text-gray-500">
                                            조회 버튼을 클릭하여 데이터를 확인하세요
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 이카운트 섹션 (초기 숨김) -->
                <div id="ecountSection" class="hidden">
                    <!-- 업로드 섹션 -->
                    <div class="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-upload mr-2"></i>
                            이카운트 품목 업로드
                        </h2>
                        
                        <form id="ecountUploadForm" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">
                                    엑셀/CSV 파일 <span class="text-red-500">*</span>
                                </label>
                                <input type="file" id="ecountFile" accept=".xlsx,.xls,.csv"
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required>
                                <p class="text-sm text-gray-500 mt-1">
                                    구매처명, 대분류, 중분류, 소분류, 품목코드, 품목명, 규격, 단위, 입고단가 등 포함
                                </p>
                            </div>

                            <button type="submit" 
                                    class="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                                <i class="fas fa-cloud-upload-alt mr-2"></i>
                                업로드
                            </button>
                        </form>

                        <div id="ecountUploadResult" class="mt-4 hidden"></div>
                    </div>

                    <!-- 조회 섹션 -->
                    <div class="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 class="text-2xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-search mr-2"></i>
                            품목 조회
                        </h2>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">구매처명</label>
                                <input type="text" id="ecountSupplier" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: ABC상사">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">대분류</label>
                                <input type="text" id="ecountCategoryLarge" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 의료재료">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">중분류</label>
                                <input type="text" id="ecountCategoryMedium" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 임플란트">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">소분류</label>
                                <input type="text" id="ecountCategorySmall" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 픽스쳐">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">품목코드</label>
                                <input type="text" id="ecountProductCode" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: P001">
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">품목명</label>
                                <input type="text" id="ecountProductName" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
                                       placeholder="예: 임플란트 픽스쳐">
                            </div>
                        </div>

                        <div class="flex space-x-4 mb-4">
                            <button id="ecountSearchBtn" 
                                    class="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors">
                                <i class="fas fa-search mr-2"></i>
                                조회
                            </button>
                            <button id="ecountDeleteSelectedBtn" 
                                    class="bg-red-600 text-white py-3 px-6 rounded-lg hover:bg-red-700 transition-colors">
                                <i class="fas fa-trash mr-2"></i>
                                선택 삭제 (<span id="selectedCount">0</span>)
                            </button>
                        </div>

                        <div class="mb-4 text-sm text-gray-600">
                            조회 결과: <span id="ecountCount" class="font-bold">0</span>건 (총 <span id="ecountTotal" class="font-bold">0</span>건)
                        </div>

                        <!-- 페이지네이션 (상단) -->
                        <div id="ecountPaginationTop" class="mb-4 flex justify-center space-x-2"></div>

                        <div class="overflow-x-auto">
                            <table class="min-w-full bg-white border border-gray-300">
                                <thead class="bg-gray-100">
                                    <tr>
                                        <th class="px-4 py-3 border-b text-center text-sm font-semibold text-gray-700">
                                            <input type="checkbox" id="selectAllEcount" class="w-4 h-4 cursor-pointer">
                                        </th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">구매처명</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">대분류</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">중분류</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">소분류</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">품목코드</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">품목명</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">입고단가</th>
                                        <th class="px-4 py-3 border-b text-left text-sm font-semibold text-gray-700">액션</th>
                                    </tr>
                                </thead>
                                <tbody id="ecountTableBody">
                                    <tr>
                                        <td colspan="9" class="px-4 py-8 text-center text-gray-500">
                                            조회 버튼을 클릭하여 데이터를 확인하세요
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div id="ecountPagination" class="mt-4 flex justify-center space-x-2"></div>
                    </div>
                </div>
            </main>

            <!-- 수정 모달 -->
            <div id="editModal" class="fixed inset-0 bg-gray-800 bg-opacity-50 hidden flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                    <h3 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-edit mr-2"></i>
                        품목 수정
                    </h3>
                    
                    <form id="editForm" class="space-y-4">
                        <input type="hidden" id="editId">
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">구매처명</label>
                                <input type="text" id="editSupplierName" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">품목코드</label>
                                <input type="text" id="editProductCode" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">대분류</label>
                                <input type="text" id="editCategoryLarge" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">중분류</label>
                                <input type="text" id="editCategoryMedium" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">소분류</label>
                                <input type="text" id="editCategorySmall" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">품목명 *</label>
                                <input type="text" id="editProductName" required
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">규격</label>
                                <input type="text" id="editSpecification" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">단위</label>
                                <input type="text" id="editUnit" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">입고단가</label>
                                <input type="number" id="editUnitPrice" 
                                       class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                        </div>
                        
                        <div class="flex space-x-4 pt-4">
                            <button type="submit" 
                                    class="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                                <i class="fas fa-save mr-2"></i>
                                저장
                            </button>
                            <button type="button" onclick="closeEditModal()" 
                                    class="flex-1 bg-gray-500 text-white py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors">
                                <i class="fas fa-times mr-2"></i>
                                취소
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        // ===== 메뉴 전환 =====
        const menuEmr = document.getElementById('menuEmr');
        const menuEcount = document.getElementById('menuEcount');
        const emrSection = document.getElementById('emrSection');
        const ecountSection = document.getElementById('ecountSection');

        menuEmr.addEventListener('click', () => {
            menuEmr.classList.add('bg-blue-100', 'text-blue-700', 'font-medium');
            menuEmr.classList.remove('text-gray-700');
            menuEcount.classList.remove('bg-blue-100', 'text-blue-700', 'font-medium');
            menuEcount.classList.add('text-gray-700');
            emrSection.classList.remove('hidden');
            ecountSection.classList.add('hidden');
        });

        menuEcount.addEventListener('click', () => {
            menuEcount.classList.add('bg-blue-100', 'text-blue-700', 'font-medium');
            menuEcount.classList.remove('text-gray-700');
            menuEmr.classList.remove('bg-blue-100', 'text-blue-700', 'font-medium');
            menuEmr.classList.add('text-gray-700');
            ecountSection.classList.remove('hidden');
            emrSection.classList.add('hidden');
        });

        // ===== EMR 섹션 스크립트 =====
        
        // 업로드 폼 처리
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const branchName = document.getElementById('branchName').value;
            const surgeryFile = document.getElementById('surgeryFile').files[0];
            const insuranceFile = document.getElementById('insuranceFile').files[0];
            
            if (!surgeryFile && !insuranceFile) {
                alert('최소 하나의 파일을 선택해주세요.');
                return;
            }
            
            const formData = new FormData();
            formData.append('branchName', branchName);
            if (surgeryFile) formData.append('surgeryFile', surgeryFile);
            if (insuranceFile) formData.append('insuranceFile', insuranceFile);
            
            const resultDiv = document.getElementById('uploadResult');
            resultDiv.innerHTML = '<div class="text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>업로드 중...</div>';
            resultDiv.classList.remove('hidden');
            
            try {
                const response = await axios.post('/api/upload', formData);
                
                if (response.data.success) {
                    resultDiv.innerHTML = \`
                        <div class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                            <i class="fas fa-check-circle mr-2"></i>
                            \${response.data.message}
                        </div>
                    \`;
                    document.getElementById('uploadForm').reset();
                } else {
                    throw new Error(response.data.message);
                }
            } catch (err) {
                const errorData = err.response?.data;
                let errorMessage = \`
                    <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                        <i class="fas fa-exclamation-circle mr-2"></i>
                        오류: \${errorData?.message || err.message}
                \`;
                
                if (errorData?.errors && errorData.errors.length > 0) {
                    errorMessage += '<ul class="list-disc list-inside mt-2">';
                    errorData.errors.forEach(e => {
                        errorMessage += \`<li>\${e}</li>\`;
                    });
                    errorMessage += '</ul>';
                }
                
                errorMessage += '</div>';
                resultDiv.innerHTML = errorMessage;
            }
        });

        // 현재 조회된 레코드 저장
        let currentRecords = [];

        // 조회 버튼
        document.getElementById('searchBtn').addEventListener('click', async () => {
            const params = new URLSearchParams();
            
            const branch = document.getElementById('filterBranch').value;
            const patient = document.getElementById('filterPatient').value;
            const chart = document.getElementById('filterChart').value;
            const startDate = document.getElementById('filterStartDate').value;
            const endDate = document.getElementById('filterEndDate').value;
            const supplier = document.getElementById('filterSupplier').value;
            const productName = document.getElementById('filterProductName').value;
            
            if (branch) params.append('branch_name', branch);
            if (patient) params.append('patient_name', patient);
            if (chart) params.append('chart_number', chart);
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);
            if (supplier) params.append('supplier', supplier);
            if (productName) params.append('product_name', productName);
            
            try {
                const response = await axios.get(\`/api/records?\${params}\`);
                
                if (response.data.success) {
                    currentRecords = response.data.data;
                    displayRecords(currentRecords);
                    document.getElementById('recordCount').textContent = response.data.count;
                }
            } catch (err) {
                alert('조회 중 오류가 발생했습니다: ' + err.message);
            }
        });

        // 레코드 표시 함수
        function displayRecords(records) {
            const tableBody = document.getElementById('resultTableBody');
            const deleteAllBtn = document.getElementById('deleteAllBtn');
            
            if (records.length === 0) {
                tableBody.innerHTML = \`
                    <tr>
                        <td colspan="9" class="px-4 py-8 text-center text-gray-500">
                            조회된 데이터가 없습니다
                        </td>
                    </tr>
                \`;
                deleteAllBtn.classList.add('hidden');
                return;
            }
            
            deleteAllBtn.classList.remove('hidden');
            
            // 합계 계산
            let boneTotalQty = 0;
            let implantTotalQty = 0;
            
            records.forEach(record => {
                record.bone_graft?.forEach(b => {
                    if (b.quantity > 0 && !b.reference_tooth) {
                        boneTotalQty += b.quantity || 0;
                    }
                });
                
                record.implant?.forEach(i => {
                    if (i.supplier !== 'GBR Only') {
                        implantTotalQty += i.quantity || 0;
                    }
                });
            });
            
            document.getElementById('boneTotal').textContent = boneTotalQty > 0 ? \`(합계: \${boneTotalQty})\` : '';
            document.getElementById('implantTotal').textContent = implantTotalQty > 0 ? \`(합계: \${implantTotalQty})\` : '';
            
            tableBody.innerHTML = records.map(record => {
                const boneInfo = record.bone_graft?.map(b => {
                    const displayQty = b.reference_tooth ? \`#\${b.reference_tooth.replace('#', '')}에 포함\` : b.quantity;
                    return \`
                        <div class="text-xs mb-1 p-2 bg-gray-50 rounded">
                            <div class="font-medium">\${new Date(b.date).toLocaleDateString('ko-KR')}</div>
                            <div>\${b.product_name || '-'}</div>
                            <div class="text-gray-600">수량: \${displayQty} | \${b.supplier || '-'}</div>
                        </div>
                    \`;
                }).join('') || '-';
                
                const implantInfo = record.implant?.map(i => {
                    const insuranceBadge = i.is_insurance ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded ml-2">보험</span>' : '';
                    return \`
                        <div class="text-xs mb-1 p-2 bg-gray-50 rounded">
                            <div class="font-medium">\${new Date(i.date).toLocaleDateString('ko-KR')}</div>
                            <div>\${i.product_name || '-'}\${insuranceBadge}</div>
                            <div class="text-gray-600">수량: \${i.quantity} | \${i.supplier || '-'}</div>
                        </div>
                    \`;
                }).join('') || '-';
                
                return \`
                    <tr class="border-b hover:bg-gray-50 emr-row" data-id="\${record.id}">
                        <td class="px-4 py-3 text-center">
                            <input type="checkbox" class="emr-checkbox w-4 h-4 cursor-pointer" value="\${record.id}">
                        </td>
                        <td class="px-4 py-3">\${record.branch_name}</td>
                        <td class="px-4 py-3">\${record.patient_name}</td>
                        <td class="px-4 py-3">\${record.chart_number}</td>
                        <td class="px-4 py-3">\${record.tooth_number}</td>
                        <td class="px-4 py-3">\${boneInfo}</td>
                        <td class="px-4 py-3">\${implantInfo}</td>
                        <td class="px-4 py-3">\${new Date(record.created_at).toLocaleDateString('ko-KR')}</td>
                        <td class="px-4 py-3">
                            <button onclick="deleteRecord(\${record.id})" 
                                    class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                \`;
            }).join('');
            
            // EMR 체크박스 이벤트 리스너 추가
            updateEmrSelectedCount();
            document.querySelectorAll('.emr-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', updateEmrSelectedCount);
            });
        }

        // 개별 레코드 삭제
        async function deleteRecord(recordId) {
            if (!confirm('이 레코드를 삭제하시겠습니까?')) return;
            
            try {
                const response = await axios.delete(\`/api/records/\${recordId}\`);
                
                if (response.data.success) {
                    alert('삭제되었습니다.');
                    document.getElementById('searchBtn').click();
                } else {
                    alert('삭제에 실패했습니다: ' + response.data.message);
                }
            } catch (err) {
                alert('삭제 중 오류가 발생했습니다: ' + err.message);
            }
        }

        // EMR 전체 선택
        document.getElementById('selectAllEmr').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.emr-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
            updateEmrSelectedCount();
        });

        // EMR 선택 개수 업데이트
        function updateEmrSelectedCount() {
            const selectedIds = Array.from(document.querySelectorAll('.emr-checkbox:checked')).map(cb => cb.value);
            document.getElementById('emrSelectedCount').textContent = selectedIds.length;
        }

        // 조회 결과 선택 삭제
        document.getElementById('deleteAllBtn').addEventListener('click', async () => {
            const selectedIds = Array.from(document.querySelectorAll('.emr-checkbox:checked')).map(cb => parseInt(cb.value));
            
            if (selectedIds.length === 0) {
                alert('삭제할 레코드를 선택해주세요.');
                return;
            }
            
            if (!confirm(\`선택한 \${selectedIds.length}건의 레코드를 삭제하시겠습니까?\`)) return;
            
            try {
                const response = await axios.post('/api/records/batch-delete', { record_ids: selectedIds });
                
                if (response.data.success) {
                    alert(response.data.message);
                    document.getElementById('searchBtn').click();
                } else {
                    alert('삭제에 실패했습니다: ' + response.data.message);
                }
            } catch (err) {
                alert('일괄 삭제 중 오류가 발생했습니다: ' + err.message);
            }
        });

        // 페이지 로드시 전체 데이터 조회
        document.getElementById('searchBtn').click();

        // ===== 이카운트 섹션 스크립트 =====
        
        // 이카운트 업로드 폼 처리
        document.getElementById('ecountUploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const file = document.getElementById('ecountFile').files[0];
            
            if (!file) {
                alert('파일을 선택해주세요.');
                return;
            }
            
            const formData = new FormData();
            formData.append('file', file);
            
            const resultDiv = document.getElementById('ecountUploadResult');
            resultDiv.innerHTML = '<div class="text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>처리 중...</div>';
            resultDiv.classList.remove('hidden');
            
            try {
                const response = await axios.post('/api/ecount/upload', formData);
                
                if (response.data.success) {
                    resultDiv.innerHTML = \`
                        <div class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                            <i class="fas fa-check-circle mr-2"></i>
                            \${response.data.message}
                        </div>
                    \`;
                    document.getElementById('ecountUploadForm').reset();
                    document.getElementById('ecountSearchBtn').click();
                } else {
                    throw new Error(response.data.message);
                }
            } catch (err) {
                resultDiv.innerHTML = \`
                    <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                        <i class="fas fa-exclamation-circle mr-2"></i>
                        \${err.response?.data?.message || err.message}
                    </div>
                \`;
            }
        });

        // 이카운트 조회
        let currentPage = 1;
        
        document.getElementById('ecountSearchBtn').addEventListener('click', () => {
            currentPage = 1;
            searchEcountProducts();
        });

        async function searchEcountProducts() {
            const params = new URLSearchParams();
            
            const supplier = document.getElementById('ecountSupplier').value;
            const large = document.getElementById('ecountCategoryLarge').value;
            const medium = document.getElementById('ecountCategoryMedium').value;
            const small = document.getElementById('ecountCategorySmall').value;
            const code = document.getElementById('ecountProductCode').value;
            const name = document.getElementById('ecountProductName').value;
            
            if (supplier) params.append('supplier_name', supplier);
            if (large) params.append('category_large', large);
            if (medium) params.append('category_medium', medium);
            if (small) params.append('category_small', small);
            if (code) params.append('product_code', code);
            if (name) params.append('product_name', name);
            params.append('page', currentPage);
            params.append('page_size', '100');
            
            try {
                const response = await axios.get(\`/api/ecount/products?\${params}\`);
                
                if (response.data.success) {
                    displayEcountProducts(response.data.products);
                    displayPagination(response.data.totalPages);
                    document.getElementById('ecountCount').textContent = response.data.products.length;
                    document.getElementById('ecountTotal').textContent = response.data.totalCount;
                }
            } catch (err) {
                alert('조회 중 오류가 발생했습니다: ' + err.message);
            }
        }

        function displayEcountProducts(products) {
            const tableBody = document.getElementById('ecountTableBody');
            
            if (products.length === 0) {
                tableBody.innerHTML = \`
                    <tr>
                        <td colspan="9" class="px-4 py-8 text-center text-gray-500">
                            조회된 데이터가 없습니다
                        </td>
                    </tr>
                \`;
                return;
            }
            
            tableBody.innerHTML = products.map(p => \`
                <tr class="border-b hover:bg-gray-50 product-row" data-id="\${p.id}">
                    <td class="px-4 py-3 text-center">
                        <input type="checkbox" class="product-checkbox w-4 h-4 cursor-pointer" value="\${p.id}">
                    </td>
                    <td class="px-4 py-3">\${p.supplier_name || '-'}</td>
                    <td class="px-4 py-3">\${p.category_large || '-'}</td>
                    <td class="px-4 py-3">\${p.category_medium || '-'}</td>
                    <td class="px-4 py-3">\${p.category_small || '-'}</td>
                    <td class="px-4 py-3">\${p.product_code || '-'}</td>
                    <td class="px-4 py-3">\${p.product_name || '-'}</td>
                    <td class="px-4 py-3">\${p.unit_price ? p.unit_price.toLocaleString() + '원' : '-'}</td>
                    <td class="px-4 py-3">
                        <button onclick="openEditModal(\${p.id})" 
                                class="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm mr-2">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteEcountProduct(\${p.id})" 
                                class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            \`).join('');
            
            // 체크박스 이벤트 리스너 추가
            updateSelectedCount();
            document.querySelectorAll('.product-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', updateSelectedCount);
            });
            
            // 드래그 선택 기능
            enableDragSelection();
        }

        function displayPagination(totalPages) {
            const paginationTop = document.getElementById('ecountPaginationTop');
            const pagination = document.getElementById('ecountPagination');
            
            if (totalPages <= 1) {
                paginationTop.innerHTML = '';
                pagination.innerHTML = '';
                return;
            }
            
            let html = '';
            
            // << 버튼 (맨 처음)
            html += \`
                <button onclick="window.changePage(1)" 
                        class="bg-white text-gray-700 hover:bg-gray-100 px-3 py-2 border rounded \${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                        \${currentPage === 1 ? 'disabled' : ''}>
                    &lt;&lt;
                </button>
            \`;
            
            // < 버튼 (이전)
            html += \`
                <button onclick="window.changePage(\${currentPage - 1})" 
                        class="bg-white text-gray-700 hover:bg-gray-100 px-3 py-2 border rounded \${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}"
                        \${currentPage === 1 ? 'disabled' : ''}>
                    &lt;
                </button>
            \`;
            
            // 페이지 번호 (최대 10개씩 표시)
            const maxButtons = 10;
            const startPage = Math.floor((currentPage - 1) / maxButtons) * maxButtons + 1;
            const endPage = Math.min(startPage + maxButtons - 1, totalPages);
            
            for (let i = startPage; i <= endPage; i++) {
                const activeClass = i === currentPage ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100';
                html += \`
                    <button onclick="window.changePage(\${i})" 
                            class="\${activeClass} px-4 py-2 border rounded">
                        \${i}
                    </button>
                \`;
            }
            
            // > 버튼 (다음)
            html += \`
                <button onclick="window.changePage(\${currentPage + 1})" 
                        class="bg-white text-gray-700 hover:bg-gray-100 px-3 py-2 border rounded \${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        \${currentPage === totalPages ? 'disabled' : ''}>
                    &gt;
                </button>
            \`;
            
            // >> 버튼 (맨 끝)
            html += \`
                <button onclick="window.changePage(\${totalPages})" 
                        class="bg-white text-gray-700 hover:bg-gray-100 px-3 py-2 border rounded \${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}"
                        \${currentPage === totalPages ? 'disabled' : ''}>
                    &gt;&gt;
                </button>
            \`;
            
            paginationTop.innerHTML = html;
            pagination.innerHTML = html;
        }

        function changePage(page) {
            currentPage = page;
            searchEcountProducts();
        }
        
        // 전역으로 노출 (onclick 이벤트에서 사용하기 위해)
        window.changePage = changePage;

        async function deleteEcountProduct(id) {
            if (!confirm('이 품목을 삭제하시겠습니까?')) return;
            
            try {
                const response = await axios.delete(\`/api/ecount/products/\${id}\`);
                
                if (response.data.success) {
                    alert('삭제되었습니다.');
                    searchEcountProducts();
                } else {
                    alert('삭제에 실패했습니다: ' + response.data.message);
                }
            } catch (err) {
                alert('삭제 중 오류가 발생했습니다: ' + err.message);
            }
        }

        // 전체 선택
        document.getElementById('selectAllEcount').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.product-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
            });
            updateSelectedCount();
        });

        // 선택 개수 업데이트
        function updateSelectedCount() {
            const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.value);
            document.getElementById('selectedCount').textContent = selectedIds.length;
        }

        // 드래그 선택 기능
        function enableDragSelection() {
            let isDragging = false;
            let startCheckbox = null;
            
            const checkboxes = document.querySelectorAll('.product-checkbox');
            
            checkboxes.forEach(checkbox => {
                checkbox.parentElement.addEventListener('mousedown', (e) => {
                    if (e.target.tagName !== 'INPUT') return;
                    isDragging = true;
                    startCheckbox = e.target;
                    e.preventDefault();
                });
            });
            
            document.addEventListener('mouseover', (e) => {
                if (!isDragging) return;
                if (e.target.classList.contains('product-checkbox')) {
                    e.target.checked = startCheckbox.checked;
                    updateSelectedCount();
                }
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
                startCheckbox = null;
            });
        }

        // 일괄 삭제
        document.getElementById('ecountDeleteSelectedBtn').addEventListener('click', async () => {
            const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => parseInt(cb.value));
            
            if (selectedIds.length === 0) {
                alert('삭제할 품목을 선택해주세요.');
                return;
            }
            
            if (!confirm(\`선택한 \${selectedIds.length}개의 품목을 삭제하시겠습니까?\`)) return;
            
            try {
                let successCount = 0;
                for (const id of selectedIds) {
                    const response = await axios.delete(\`/api/ecount/products/\${id}\`);
                    if (response.data.success) successCount++;
                }
                
                alert(\`\${successCount}개의 품목이 삭제되었습니다.\`);
                searchEcountProducts();
            } catch (err) {
                alert('삭제 중 오류가 발생했습니다: ' + err.message);
            }
        });

        // 수정 모달 열기
        let currentProducts = [];
        
        async function openEditModal(id) {
            // 현재 조회된 제품 목록에서 찾기
            const params = new URLSearchParams();
            params.append('page', '1');
            params.append('page_size', '10000'); // 전체 조회
            
            try {
                const response = await axios.get(\`/api/ecount/products?\${params}\`);
                if (response.data.success) {
                    currentProducts = response.data.products;
                    const product = currentProducts.find(p => p.id === id);
                    
                    if (!product) {
                        alert('품목을 찾을 수 없습니다.');
                        return;
                    }
                    
                    document.getElementById('editId').value = product.id;
                    document.getElementById('editSupplierName').value = product.supplier_name || '';
                    document.getElementById('editProductCode').value = product.product_code || '';
                    document.getElementById('editCategoryLarge').value = product.category_large || '';
                    document.getElementById('editCategoryMedium').value = product.category_medium || '';
                    document.getElementById('editCategorySmall').value = product.category_small || '';
                    document.getElementById('editProductName').value = product.product_name || '';
                    document.getElementById('editSpecification').value = product.specification || '';
                    document.getElementById('editUnit').value = product.unit || '';
                    document.getElementById('editUnitPrice').value = product.unit_price || 0;
                    
                    document.getElementById('editModal').classList.remove('hidden');
                }
            } catch (err) {
                alert('품목 정보를 불러오는 중 오류가 발생했습니다: ' + err.message);
            }
        }

        // 수정 모달 닫기
        function closeEditModal() {
            document.getElementById('editModal').classList.add('hidden');
        }

        // 수정 폼 제출
        document.getElementById('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const id = document.getElementById('editId').value;
            const data = {
                supplier_name: document.getElementById('editSupplierName').value || null,
                product_code: document.getElementById('editProductCode').value || null,
                category_large: document.getElementById('editCategoryLarge').value || null,
                category_medium: document.getElementById('editCategoryMedium').value || null,
                category_small: document.getElementById('editCategorySmall').value || null,
                product_name: document.getElementById('editProductName').value,
                specification: document.getElementById('editSpecification').value || null,
                unit: document.getElementById('editUnit').value || null,
                unit_price: parseFloat(document.getElementById('editUnitPrice').value) || 0,
            };
            
            try {
                const response = await axios.put(\`/api/ecount/products/\${id}\`, data);
                
                if (response.data.success) {
                    alert('수정되었습니다.');
                    closeEditModal();
                    searchEcountProducts();
                } else {
                    alert('수정에 실패했습니다: ' + response.data.message);
                }
            } catch (err) {
                alert('수정 중 오류가 발생했습니다: ' + err.message);
            }
        });
    </script>
</body>
</html>
  `)
})

export default app
