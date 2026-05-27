import { prisma } from '../../config/database';
import { ApiError } from '../../middleware/errorHandler';

export async function listCategories() {
  const [categories, courseCounts] = await Promise.all([
    prisma.category.findMany({ orderBy: { label: 'asc' } }),
    prisma.courseCategory.groupBy({ by: ['category_id'], _count: { course_id: true } }),
  ]);
  const countMap = new Map(courseCounts.map((c) => [c.category_id, c._count.course_id]));
  return categories.map((cat) => ({ ...cat, course_count: countMap.get(cat.id) ?? 0 }));
}

export async function createCategory(data: { id: string; label: string; icon: string; color: string }) {
  const existing = await prisma.category.findUnique({ where: { id: data.id } });
  if (existing) throw new ApiError(409, `Category with id '${data.id}' already exists`);
  return prisma.category.create({ data });
}

export async function updateCategory(
  id: string,
  data: { label?: string; icon?: string; color?: string },
) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Category not found');
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Category not found');

  const courseCount = await prisma.courseCategory.count({ where: { category_id: id } });
  if (courseCount > 0) {
    throw new ApiError(409, `Cannot delete: ${courseCount} course(s) are using this category. Reassign them first.`);
  }

  await prisma.category.delete({ where: { id } });
  return { deleted: true };
}
