import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as XLSX from 'xlsx';
import { Bindings } from './types';
import { parseInsuranceData, parseSurgeryImplant, parseSurgeryBone } from './parser';
import { saveImplantRecords, saveBoneGraftRecords, queryTreatmentRecords } from './database';

const app = new Hono<{ Bindings: Bindings }>();

// CORS 설정
app.use('/api/*', cors());

/**
 * 엑셀 파일 업로드 및 처리 API
 * POST /api/upload
 * Body: FormData with files and branchName
 */
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const branchName = formData.get('branchName') as string;
    const surgeryFile = formData.get('surgeryFile') as File | null;
    const insuranceFile = formData.get('insuranceFile') as File | null;

    if (!branchName) {
      return c.json({ success: false, message: '지점명을 입력해주세요.' }, 400);
    }

    const db = c.env.DB;
    let totalRecords = 0;
    const errors: string[] = [];

    // 보험 데이터 파싱 (급여 임플란트 시트)
    let insMap = new Map<string, string[]>();
    if (insuranceFile) {
      try {
        const insBuffer = await insuranceFile.arrayBuffer();
        const insWorkbook = XLSX.read(insBuffer);
        const insSheetName = '급여 임플란트';
        
        if (insWorkbook.SheetNames.includes(insSheetName)) {
          const insSheet = insWorkbook.Sheets[insSheetName];
          insMap = parseInsuranceData(insSheet);
        } else {
          errors.push(`'${insSheetName}' 시트를 찾을 수 없습니다.`);
        }
      } catch (err) {
        errors.push(`보험 파일 처리 중 오류: ${err}`);
      }
    }

    // 수술기록지 파싱
    if (surgeryFile) {
      try {
        const surgBuffer = await surgeryFile.arrayBuffer();
        const surgWorkbook = XLSX.read(surgBuffer);

        // 임플란트 데이터 처리
        const implantSheetName = '수술기록지(임플란트)';
        if (surgWorkbook.SheetNames.includes(implantSheetName)) {
          const implantSheet = surgWorkbook.Sheets[implantSheetName];
          const implantRecords = parseSurgeryImplant(implantSheet, insMap);
          const count = await saveImplantRecords(db, branchName, implantRecords);
          totalRecords += count;
        }

        // 동종골 데이터 처리
        const boneSheetName = '수술기록지(뼈)';
        if (surgWorkbook.SheetNames.includes(boneSheetName)) {
          const boneSheet = surgWorkbook.Sheets[boneSheetName];
          const boneRecords = parseSurgeryBone(boneSheet);
          const count = await saveBoneGraftRecords(db, branchName, boneRecords);
          totalRecords += count;
        }

        if (!surgWorkbook.SheetNames.includes(implantSheetName) && 
            !surgWorkbook.SheetNames.includes(boneSheetName)) {
          errors.push('수술기록지 시트를 찾을 수 없습니다.');
        }
      } catch (err) {
        errors.push(`수술기록지 처리 중 오류: ${err}`);
      }
    }

    if (errors.length > 0) {
      return c.json({
        success: false,
        message: '일부 데이터 처리 중 오류가 발생했습니다.',
        recordsProcessed: totalRecords,
        errors
      }, 400);
    }

    return c.json({
      success: true,
      message: `${totalRecords}개의 레코드가 성공적으로 저장되었습니다.`,
      recordsProcessed: totalRecords
    });
  } catch (err) {
    console.error('Upload error:', err);
    return c.json({
      success: false,
      message: `서버 오류: ${err}`
    }, 500);
  }
});

/**
 * 치료 기록 조회 API
 * GET /api/records?branch_name=지점명&patient_name=환자명&chart_number=차트번호
 */
app.get('/api/records', async (c) => {
  try {
    const branchName = c.req.query('branch_name');
    const patientName = c.req.query('patient_name');
    const chartNumber = c.req.query('chart_number');

    const db = c.env.DB;
    const records = await queryTreatmentRecords(db, branchName, patientName, chartNumber);

    return c.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (err) {
    console.error('Query error:', err);
    return c.json({
      success: false,
      message: `조회 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 지점 목록 조회 API
 * GET /api/branches
 */
app.get('/api/branches', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db
      .prepare(`SELECT DISTINCT branch_name FROM treatment_records ORDER BY branch_name`)
      .all<{ branch_name: string }>();

    return c.json({
      success: true,
      data: result.results.map((r) => r.branch_name)
    });
  } catch (err) {
    return c.json({
      success: false,
      message: `조회 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 데이터베이스 초기화 API (개발용)
 * DELETE /api/reset
 */
app.delete('/api/reset', async (c) => {
  try {
    const db = c.env.DB;
    
    await db.prepare(`DELETE FROM bone_graft`).run();
    await db.prepare(`DELETE FROM implant`).run();
    await db.prepare(`DELETE FROM temporary_denture`).run();
    await db.prepare(`DELETE FROM prosthetic_occlusion`).run();
    await db.prepare(`DELETE FROM prosthetic_completion`).run();
    await db.prepare(`DELETE FROM treatment_records`).run();

    return c.json({
      success: true,
      message: '모든 데이터가 삭제되었습니다.'
    });
  } catch (err) {
    return c.json({
      success: false,
      message: `초기화 중 오류: ${err}`
    }, 500);
  }
});

/**
 * 메인 페이지
 */
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>치과 EMR 추적 시스템</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="min-h-screen">
            <!-- 헤더 -->
            <header class="bg-blue-600 text-white shadow-lg">
                <div class="container mx-auto px-4 py-6">
                    <h1 class="text-3xl font-bold">
                        <i class="fas fa-tooth mr-3"></i>
                        치과 EMR 추적 시스템
                    </h1>
                    <p class="text-blue-100 mt-2">동종골, 임플란트, 기공료 추적 관리</p>
                </div>
            </header>

            <div class="container mx-auto px-4 py-8">
                <!-- 업로드 섹션 -->
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
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                   placeholder="지점명을 입력하세요" required>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                수술기록지 파일 (임플란트/뼈)
                            </label>
                            <input type="file" id="surgeryFile" accept=".xlsx,.xls"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <p class="text-sm text-gray-500 mt-1">
                                '수술기록지(임플란트)', '수술기록지(뼈)' 시트 포함
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                급여 임플란트 파일
                            </label>
                            <input type="file" id="insuranceFile" accept=".xlsx,.xls"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            <p class="text-sm text-gray-500 mt-1">
                                '급여 임플란트' 시트 포함
                            </p>
                        </div>

                        <button type="submit" 
                                class="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                            <i class="fas fa-cloud-upload-alt mr-2"></i>
                            업로드 및 저장
                        </button>
                    </form>

                    <div id="uploadResult" class="mt-4 hidden"></div>
                </div>

                <!-- 조회 섹션 -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-search mr-2"></i>
                        데이터 조회
                    </h2>

                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">지점명</label>
                            <input type="text" id="filterBranch" 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                   placeholder="전체">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">환자명</label>
                            <input type="text" id="filterPatient" 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                   placeholder="전체">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">차트번호</label>
                            <input type="text" id="filterChart" 
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                   placeholder="전체">
                        </div>
                        <div class="flex items-end">
                            <button id="searchBtn" 
                                    class="w-full bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 transition-colors">
                                <i class="fas fa-search mr-2"></i>
                                조회
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 결과 테이블 -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-table mr-2"></i>
                            치료 기록
                        </h2>
                        <span id="recordCount" class="text-gray-600"></span>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지점</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">환자명</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">차트번호</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">치식</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">뼈이식</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">임플란트</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                                </tr>
                            </thead>
                            <tbody id="tableBody" class="bg-white divide-y divide-gray-200">
                                <tr>
                                    <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                                        조회 버튼을 클릭하여 데이터를 확인하세요
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
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
                    resultDiv.innerHTML = \`
                        <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                            <i class="fas fa-exclamation-circle mr-2"></i>
                            오류: \${err.response?.data?.message || err.message}
                        </div>
                    \`;
                }
            });
            
            // 조회 버튼 처리
            document.getElementById('searchBtn').addEventListener('click', async () => {
                const branch = document.getElementById('filterBranch').value;
                const patient = document.getElementById('filterPatient').value;
                const chart = document.getElementById('filterChart').value;
                
                const params = new URLSearchParams();
                if (branch) params.append('branch_name', branch);
                if (patient) params.append('patient_name', patient);
                if (chart) params.append('chart_number', chart);
                
                try {
                    const response = await axios.get(\`/api/records?\${params}\`);
                    
                    if (response.data.success) {
                        displayRecords(response.data.data);
                        document.getElementById('recordCount').textContent = 
                            \`총 \${response.data.count}건\`;
                    }
                } catch (err) {
                    alert('조회 중 오류가 발생했습니다: ' + err.message);
                }
            });
            
            // 테이블 렌더링
            function displayRecords(records) {
                const tbody = document.getElementById('tableBody');
                
                if (records.length === 0) {
                    tbody.innerHTML = \`
                        <tr>
                            <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                                조회된 데이터가 없습니다
                            </td>
                        </tr>
                    \`;
                    return;
                }
                
                tbody.innerHTML = records.map(record => {
                    const boneInfo = record.bone_graft?.map(b => 
                        \`<div class="text-xs mb-1">
                            <div>\${b.date}</div>
                            <div class="font-medium">\${b.product_name || '-'}</div>
                            <div>수량: \${b.quantity} | \${b.supplier || '-'}</div>
                        </div>\`
                    ).join('') || '-';
                    
                    const implantInfo = record.implant?.map(i => 
                        \`<div class="text-xs mb-1">
                            <div>\${i.date}</div>
                            <div class="font-medium">\${i.product_name || '-'}</div>
                            <div>수량: \${i.quantity} | \${i.supplier || '-'}</div>
                            \${i.is_insurance ? '<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">보험</span>' : ''}
                        </div>\`
                    ).join('') || '-';
                    
                    return \`
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 text-sm">\${record.branch_name}</td>
                            <td class="px-4 py-3 text-sm font-medium">\${record.patient_name}</td>
                            <td class="px-4 py-3 text-sm">\${record.chart_number}</td>
                            <td class="px-4 py-3 text-sm font-mono">#\${record.tooth_number}</td>
                            <td class="px-4 py-3 text-sm">\${boneInfo}</td>
                            <td class="px-4 py-3 text-sm">\${implantInfo}</td>
                            <td class="px-4 py-3 text-sm text-gray-500">
                                \${new Date(record.created_at).toLocaleDateString('ko-KR')}
                            </td>
                        </tr>
                    \`;
                }).join('');
            }
            
            // 페이지 로드시 전체 데이터 조회
            document.getElementById('searchBtn').click();
        </script>
    </body>
    </html>
  `);
});

export default app;
