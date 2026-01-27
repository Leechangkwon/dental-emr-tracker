import { EcountProduct } from './types';

/**
 * 이카운트 품목 저장
 */
export async function saveEcountProducts(
  db: D1Database,
  products: EcountProduct[]
): Promise<number> {
  let count = 0;

  for (const product of products) {
    try {
      await db
        .prepare(
          `INSERT INTO ecount_products 
           (supplier_name, image_url, category_large, category_medium, category_small, 
            product_code, product_name, specification, unit, unit_price, 
            quantity_numerator, quantity_denominator)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(product_code) DO UPDATE SET
            supplier_name = excluded.supplier_name,
            image_url = excluded.image_url,
            category_large = excluded.category_large,
            category_medium = excluded.category_medium,
            category_small = excluded.category_small,
            product_name = excluded.product_name,
            specification = excluded.specification,
            unit = excluded.unit,
            unit_price = excluded.unit_price,
            quantity_numerator = excluded.quantity_numerator,
            quantity_denominator = excluded.quantity_denominator,
            updated_at = CURRENT_TIMESTAMP`
        )
        .bind(
          product.supplier_name,
          product.image_url,
          product.category_large,
          product.category_medium,
          product.category_small,
          product.product_code,
          product.product_name,
          product.specification,
          product.unit,
          product.unit_price || 0,
          product.quantity_numerator,
          product.quantity_denominator
        )
        .run();

      count++;
    } catch (err) {
      console.error('Failed to save ecount product:', product.product_name, err);
    }
  }

  return count;
}

/**
 * 이카운트 품목 조회
 */
export async function queryEcountProducts(
  db: D1Database,
  filters: {
    supplier_name?: string;
    category_large?: string;
    category_medium?: string;
    category_small?: string;
    product_code?: string;
    product_name?: string;
  },
  page: number = 1,
  limit: number = 100
): Promise<{ products: EcountProduct[]; total: number }> {
  let query = `SELECT * FROM ecount_products WHERE 1=1`;
  const params: any[] = [];

  if (filters.supplier_name) {
    query += ` AND supplier_name LIKE ?`;
    params.push(`%${filters.supplier_name}%`);
  }

  if (filters.category_large) {
    query += ` AND category_large LIKE ?`;
    params.push(`%${filters.category_large}%`);
  }

  if (filters.category_medium) {
    query += ` AND category_medium LIKE ?`;
    params.push(`%${filters.category_medium}%`);
  }

  if (filters.category_small) {
    query += ` AND category_small LIKE ?`;
    params.push(`%${filters.category_small}%`);
  }

  if (filters.product_code) {
    query += ` AND product_code LIKE ?`;
    params.push(`%${filters.product_code}%`);
  }

  if (filters.product_name) {
    query += ` AND product_name LIKE ?`;
    params.push(`%${filters.product_name}%`);
  }

  // 전체 개수 조회
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  // 페이지네이션
  const offset = (page - 1) * limit;
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<EcountProduct>();

  return {
    products: result.results || [],
    total
  };
}

/**
 * 이카운트 품목 수정
 */
export async function updateEcountProduct(
  db: D1Database,
  id: number,
  product: Partial<EcountProduct>
): Promise<boolean> {
  try {
    await db
      .prepare(
        `UPDATE ecount_products SET
         supplier_name = ?,
         image_url = ?,
         category_large = ?,
         category_medium = ?,
         category_small = ?,
         product_code = ?,
         product_name = ?,
         specification = ?,
         unit = ?,
         unit_price = ?,
         quantity_numerator = ?,
         quantity_denominator = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        product.supplier_name,
        product.image_url,
        product.category_large,
        product.category_medium,
        product.category_small,
        product.product_code,
        product.product_name,
        product.specification,
        product.unit,
        product.unit_price || 0,
        product.quantity_numerator,
        product.quantity_denominator,
        id
      )
      .run();

    return true;
  } catch (err) {
    console.error('Update ecount product error:', err);
    return false;
  }
}

/**
 * 이카운트 품목 삭제
 */
export async function deleteEcountProduct(
  db: D1Database,
  id: number
): Promise<boolean> {
  try {
    await db.prepare(`DELETE FROM ecount_products WHERE id = ?`).bind(id).run();
    return true;
  } catch (err) {
    console.error('Delete ecount product error:', err);
    return false;
  }
}
