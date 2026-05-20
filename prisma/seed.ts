import {
  PrismaClient,
  Role,
  OrgRole,
  Difficulty,
  CourseStatus,
  CourseVisibility,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Categories (mirrors mobile constants.js CATEGORIES) ────────────────────
  await prisma.category.createMany({
    skipDuplicates: true,
    data: [
      { id: 'engineering', label: 'Engineering',  icon: 'construct',       color: '#FF6B35' },
      { id: 'ai',          label: 'AI & ML',       icon: 'hardware-chip',   color: '#00B4D8' },
      { id: 'digital',     label: 'Digital',       icon: 'globe',           color: '#6C63FF' },
      { id: 'math',        label: 'Mathematics',   icon: 'calculator',      color: '#F72585' },
      { id: 'psychology',  label: 'Psychology',    icon: 'brain',           color: '#4CC9F0' },
      { id: 'business',    label: 'Business',      icon: 'briefcase',       color: '#FF9F1C' },
      { id: 'finance',     label: 'Finance',       icon: 'cash',            color: '#2EC4B6' },
      { id: 'art',         label: 'Art & Design',  icon: 'color-palette',   color: '#E040FB' },
    ],
  });
  console.log('✓ categories');

  // ── Super admin ─────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('SuperAdmin123!', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      full_name:         'Super Admin',
      username:          'superadmin',
      phone:             '+10000000000',
      email:             'admin@edutok.app',
      password_hash:     adminHash,
      role:              Role.super_admin,
      is_phone_verified: true,
      is_email_verified: true,
    },
  });
  console.log('✓ super_admin:', admin.username);

  // ── Instructors (mirrors mobile mockData.js INSTRUCTORS) ────────────────────
  const instHash = await bcrypt.hash('Instructor123!', 12);

  const inst1 = await prisma.user.upsert({
    where: { username: 'dr.sarahchen' },
    update: {},
    create: {
      full_name:         'Dr. Sarah Chen',
      username:          'dr.sarahchen',
      phone:             '+10000000001',
      email:             'sarah.chen@techlearn.edu',
      password_hash:     instHash,
      role:              Role.instructor,
      bio:               'Software engineer and educator with 10+ years teaching Python, AI, and full-stack web development.',
      avatar_url:        'https://picsum.photos/seed/drchen/200/200',
      is_phone_verified: true,
      is_email_verified: true,
    },
  });

  const inst2 = await prisma.user.upsert({
    where: { username: 'prof.jamesosei' },
    update: {},
    create: {
      full_name:         'Prof. James Osei',
      username:          'prof.jamesosei',
      phone:             '+10000000002',
      email:             'james.osei@mathmind.edu',
      password_hash:     instHash,
      role:              Role.instructor,
      bio:               'Mathematics professor making calculus and learning science approachable for everyone.',
      avatar_url:        'https://picsum.photos/seed/profosei/200/200',
      is_phone_verified: true,
      is_email_verified: true,
    },
  });

  const inst3 = await prisma.user.upsert({
    where: { username: 'amara.nwosu' },
    update: {},
    create: {
      full_name:         'Amara Nwosu',
      username:          'amara.nwosu',
      phone:             '+10000000003',
      email:             'amara@bizboost.edu',
      password_hash:     instHash,
      role:              Role.instructor,
      bio:               'Business strategist and financial educator helping learners build real-world business skills.',
      avatar_url:        'https://picsum.photos/seed/amara/200/200',
      is_phone_verified: true,
      is_email_verified: true,
    },
  });
  console.log('✓ instructors:', inst1.username, inst2.username, inst3.username);

  // ── Organizations (mirrors mobile mockData.js ORGANIZATIONS) ────────────────
  const org1 = await prisma.organization.upsert({
    where: { id: 'org_techlearn' },
    update: {},
    create: {
      id:            'org_techlearn',
      name:          'TechLearn Academy',
      logo_url:      'https://picsum.photos/seed/techlearn/200/200',
      description:   'Empowering the next generation of technologists with bite-sized engineering and AI lessons.',
      owner_user_id: inst1.id,
      website:       'https://techlearn.academy',
    },
  });

  const org2 = await prisma.organization.upsert({
    where: { id: 'org_mathmind' },
    update: {},
    create: {
      id:            'org_mathmind',
      name:          'MathMind Institute',
      logo_url:      'https://picsum.photos/seed/mathmind/200/200',
      description:   'Making mathematics and psychology accessible for everyone, one 3-minute lesson at a time.',
      owner_user_id: inst2.id,
      website:       'https://mathmind.institute',
    },
  });

  const org3 = await prisma.organization.upsert({
    where: { id: 'org_bizboost' },
    update: {},
    create: {
      id:            'org_bizboost',
      name:          'BizBoost School',
      logo_url:      'https://picsum.photos/seed/bizboost/200/200',
      description:   'Practical business, finance, and digital marketing knowledge for ambitious learners.',
      owner_user_id: inst3.id,
      website:       'https://bizboost.school',
    },
  });
  console.log('✓ organizations:', org1.name, org2.name, org3.name);

  // ── Org memberships ─────────────────────────────────────────────────────────
  await prisma.orgMember.createMany({
    skipDuplicates: true,
    data: [
      { user_id: inst1.id, org_id: org1.id, role: OrgRole.instructor },
      { user_id: inst2.id, org_id: org2.id, role: OrgRole.instructor },
      { user_id: inst3.id, org_id: org3.id, role: OrgRole.instructor },
    ],
  });
  console.log('✓ org_members');

  // ── Sample course + lessons ──────────────────────────────────────────────────
  const course1 = await prisma.course.upsert({
    where: { id: 'course_python101' },
    update: {},
    create: {
      id:            'course_python101',
      org_id:        org1.id,
      instructor_id: inst1.id,
      title:         'Python for Beginners',
      description:   'Learn Python programming from scratch with bite-sized 3-minute lessons.',
      category:      'engineering',
      tags:          ['Python', 'Programming', 'Beginner'],
      difficulty:    Difficulty.Beginner,
      status:        CourseStatus.approved,
      visibility:    CourseVisibility.public,
      published_at:  new Date(),
    },
  });

  await prisma.lesson.createMany({
    skipDuplicates: true,
    data: [
      {
        id:           'lesson_py_01',
        course_id:    course1.id,
        title:        'What is Python?',
        type:         'text',
        content_json: { body: 'Python is a high-level, interpreted language created by Guido van Rossum in 1991. It prioritises readability and simplicity.' },
        order_index:  1,
        duration_secs: 180,
        has_quiz:     true,
      },
      {
        id:           'lesson_py_02',
        course_id:    course1.id,
        title:        'Variables & Data Types',
        type:         'text',
        content_json: { body: 'Variables are created the moment you assign a value. Python supports int, float, str, bool, list, dict, tuple, and set.' },
        order_index:  2,
        duration_secs: 180,
        has_quiz:     false,
      },
    ],
  });

  await prisma.quiz.upsert({
    where: { lesson_id: 'lesson_py_01' },
    update: {},
    create: {
      lesson_id:      'lesson_py_01',
      type:           'truefalse',
      questions_json: [
        { id: 'q1', type: 'truefalse', text: 'Python was created by Guido van Rossum.', correctAnswer: true },
      ],
    },
  });
  console.log('✓ sample course + lessons + quiz');

  console.log('\nSeed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
