ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'consultant' BEFORE 'coach';
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'temp' BEFORE 'coach';
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'operations' BEFORE 'admin';
