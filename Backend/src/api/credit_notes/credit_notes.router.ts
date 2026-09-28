/**
 * Credit notes — lookup and manual redemption, scoped to the caller's store.
 *
 * (Checkout redeems credit notes itself when a CREDIT_NOTE payment is used;
 * POST /redeem exists for manual adjustments by staff who can take payments.)
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';
import { round2 } from '@/shared/money';

export const creditNotesRouter = Router();
creditNotesRouter.use(authenticate);

creditNotesRouter.get('/:code', requirePermission('billing:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const creditNote = await db('credit_notes')
      .where({ store_id: storeId, credit_note_number: param(req.params, 'code') })
      .first();

    if (!creditNote) throw AppError.notFound('Credit note not found.');
    if (creditNote.status !== 'ACTIVE') throw AppError.badRequest(`Credit note is ${creditNote.status}.`);
    if (creditNote.expiryDate && new Date(creditNote.expiryDate) < new Date()) {
      throw AppError.badRequest('Credit note has expired.');
    }
    if (Number(creditNote.remainingAmount) <= 0) throw AppError.badRequest('Credit note balance is zero.');

    res.json(creditNote);
  } catch (err) {
    next(err);
  }
});

const redeemSchema = z.object({
  creditNoteNumber: z.string().trim().min(1),
  amountToRedeem: z.number().positive(),
});

creditNotesRouter.post('/redeem', requirePermission('billing:create'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const { creditNoteNumber, amountToRedeem } = redeemSchema.parse(req.body);

    const result = await db.transaction(async (trx) => {
      const cn = await trx('credit_notes')
        .where({ store_id: storeId, credit_note_number: creditNoteNumber })
        .forUpdate()
        .first();
      if (!cn) throw AppError.notFound('Credit note not found.');
      if (cn.status !== 'ACTIVE') throw AppError.badRequest(`Credit note is ${cn.status}.`);
      if (cn.expiryDate && new Date(cn.expiryDate) < new Date()) throw AppError.badRequest('Credit note has expired.');

      const remaining = Number(cn.remainingAmount);
      if (amountToRedeem > remaining + 0.001) {
        throw AppError.badRequest(
          `Requested ₹${amountToRedeem.toFixed(2)} exceeds the remaining balance of ₹${remaining.toFixed(2)}.`
        );
      }

      const newRemaining = round2(remaining - amountToRedeem);
      const newStatus = newRemaining <= 0 ? 'REDEEMED' : 'ACTIVE';
      await trx('credit_notes').where({ id: cn.id }).update({ remaining_amount: newRemaining, status: newStatus });

      return {
        id: cn.id,
        creditNoteNumber: cn.creditNoteNumber,
        redeemedAmount: amountToRedeem,
        remainingBalance: newRemaining,
        status: newStatus,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
