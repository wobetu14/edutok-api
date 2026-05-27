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

export async function listCategoryCourses(categoryId: string, page: number, limit: number) {
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) throw new ApiError(404, 'Category not found');

  const skip = (page - 1) * limit;

  const where = { course_categories: { some: { category_id: categoryId } } };

  const [courses, total] = await prisma.$transaction([
    prisma.course.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        organization: { select: { id: true, name: true } },
        _count:       { select: { lessons: true } },
      },
    }),
    prisma.course.count({ where }),
  ]);

  return {
    courses: courses.map(({ _count, ...c }) => ({ ...c, lesson_count: _count.lessons })),
    total,
  };
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
