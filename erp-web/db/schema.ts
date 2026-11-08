import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const pushSubscriptions=sqliteTable('push_subscriptions',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),endpoint:text('endpoint').notNull(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),deviceName:text('device_name').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('push_subscriptions_user_idx').on(t.userId)]);
export const pushSends=sqliteTable('push_sends',{
 id:text('id').primaryKey(),scope:text('scope').notNull(),title:text('title').notNull(),body:text('body').notNull(),createdAt:integer('created_at').notNull(),status:text('status').notNull(),accepted:integer('accepted').notNull().default(0),failed:integer('failed').notNull().default(0),expired:integer('expired').notNull().default(0),
},t=>[index('push_sends_scope_time_idx').on(t.scope,t.createdAt)]);
