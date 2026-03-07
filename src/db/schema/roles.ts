import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { courses, modules, lessons } from "./courses";
import { accessTierEnum } from "./access";

// --- Tables ---

// Roles: named permission bundles grouping course access + feature flags
export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#6b7280"),
  allCourses: boolean("all_courses").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

// Role Courses: which courses a role grants access to (supports course/module/lesson granularity)
export const roleCourses = pgTable("role_courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  moduleId: uuid("module_id").references(() => modules.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
  accessTier: accessTierEnum("access_tier").notNull().default("full"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("role_courses_unique").on(table.roleId, table.courseId, table.moduleId, table.lessonId),
  index("role_courses_role_id_idx").on(table.roleId),
]);

// Role Features: which feature flags a role enables
export const roleFeatures = pgTable("role_features", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("role_features_role_feature_unique").on(table.roleId, table.featureKey),
  index("role_features_role_id_idx").on(table.roleId),
]);

// User Roles: assigns roles to users
export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId),
  index("user_roles_user_id_idx").on(table.userId),
  index("user_roles_role_id_idx").on(table.roleId),
]);

// --- Relations ---

export const rolesRelations = relations(roles, ({ one, many }) => ({
  roleCourses: many(roleCourses),
  roleFeatures: many(roleFeatures),
  userRoles: many(userRoles),
  createdByUser: one(users, {
    fields: [roles.createdBy],
    references: [users.id],
  }),
}));

export const roleCoursesRelations = relations(roleCourses, ({ one }) => ({
  role: one(roles, {
    fields: [roleCourses.roleId],
    references: [roles.id],
  }),
  course: one(courses, {
    fields: [roleCourses.courseId],
    references: [courses.id],
  }),
  module: one(modules, {
    fields: [roleCourses.moduleId],
    references: [modules.id],
  }),
  lesson: one(lessons, {
    fields: [roleCourses.lessonId],
    references: [lessons.id],
  }),
}));

export const roleFeaturesRelations = relations(roleFeatures, ({ one }) => ({
  role: one(roles, {
    fields: [roleFeatures.roleId],
    references: [roles.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: "userRoleUser",
  }),
  assignedByUser: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
    relationName: "userRoleAssigner",
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

// --- Type Inference ---

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type RoleCourse = typeof roleCourses.$inferSelect;
export type NewRoleCourse = typeof roleCourses.$inferInsert;

export type RoleFeature = typeof roleFeatures.$inferSelect;
export type NewRoleFeature = typeof roleFeatures.$inferInsert;

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
