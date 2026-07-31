import { type Db, getDb } from '@xnuxuz/db';
import { env } from './config/env.js';

// Anotasi tipe eksplisit — tanpa ini tsc mencoba menamai tipe Prisma lewat
// path node_modules yang tidak portabel.
export const db: Db = getDb(env.DATABASE_URL);
