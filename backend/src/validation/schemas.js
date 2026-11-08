import { z } from 'zod';
import { AppError } from '../lib/errors.js';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');
const optionalDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  dateString.nullable().optional(),
);

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'יש להזין שם משתמש').max(100),
  password: z.string().min(1, 'יש להזין סיסמה'),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים'),
});

export const apartmentSchema = z.object({
  number: z.string().trim().min(1, 'יש להזין מספר דירה').max(20),
  floor: z.string().trim().max(20).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  tenant: z
    .object({
      fullName: z.string().trim().min(1),
      phone: z.string().trim().max(30).optional().default(''),
      monthlyRent: z.number().nonnegative(),
      startDate: dateString,
      endDate: optionalDate,
      notes: z.string().trim().max(2000).optional().default(''),
    })
    .optional(),
});

export const apartmentUpdateSchema = z.object({
  number: z.string().trim().min(1).max(20),
  floor: z.string().trim().max(20).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
});

export const leaseSchema = z.object({
  fullName: z.string().trim().min(1, 'יש להזין שם דייר'),
  phone: z.string().trim().max(30).optional().default(''),
  monthlyRent: z.number().nonnegative(),
  startDate: dateString,
  endDate: optionalDate,
  notes: z.string().trim().max(2000).optional().default(''),
});

export const buildingSchema = z.object({
  name: z.string().trim().min(1, 'יש להזין שם בניין'),
  address: z.string().trim().max(300).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
});

export const tariffSchema = z.object({
  meterType: z.enum(['electricity', 'water']),
  price: z.number().nonnegative(),
  effectiveFrom: dateString,
});

const readingSchema = z.object({
  current: z.number().nonnegative(),
  previous: z.number().nonnegative().optional(),
  tariffPrice: z.number().nonnegative().optional(),
});

export const monthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  rentAmount: z.number().nonnegative().optional(),
  electricity: readingSchema.optional(),
  water: readingSchema.optional(),
});

const excelImportRowSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    rentAmount: z.number().nonnegative().optional(),
    electricity: readingSchema.optional(),
    water: readingSchema.optional(),
  })
  .refine((row) => row.rentAmount != null || row.electricity || row.water, {
    message: 'כל שורה חייבת להכיל לפחות שכר דירה או קריאת מונה אחת',
  });

export const excelImportSchema = z.object({
  rows: z.array(excelImportRowSchema).min(1, 'לא נבחרו חודשים לייבוא').max(240, 'ניתן לייבא עד 240 חודשים בכל פעם'),
});

export const monthUpdateSchema = z
  .object({
    rentAmount: z.number().nonnegative().optional(),
    electricity: z
      .object({
        current: z.number().nonnegative().optional(),
        previous: z.number().nonnegative().optional(),
        tariffPrice: z.number().nonnegative().optional(),
      })
      .optional(),
    water: z
      .object({
        current: z.number().nonnegative().optional(),
        previous: z.number().nonnegative().optional(),
        tariffPrice: z.number().nonnegative().optional(),
      })
      .optional(),
  })
  .refine((value) => value.rentAmount != null || value.electricity || value.water, {
    message: 'לא נבחרו שדות לעדכון',
  });

export const paymentSchema = z.object({
  paymentDate: dateString,
  amount: z.number().positive('יש להזין סכום גדול מאפס'),
  method: z.enum(['cash', 'bank_transfer', 'check', 'other']),
  category: z.enum(['rent', 'electricity', 'water', 'multiple']),
  applyToOldest: z.boolean().optional().default(false),
  billingYear: z.number().int().min(2000).max(2100),
  billingMonth: z.number().int().min(1).max(12),
  notes: z.string().trim().max(2000).optional().default(''),
  referenceNumber: z.string().trim().max(60).optional().default(''),
});

export function parseBody(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues[0]?.message || 'הנתונים שהוזנו אינם תקינים';
    throw new AppError(400, message === 'Required' ? 'הנתונים שהוזנו אינם תקינים' : message);
  }
  return result.data;
}
