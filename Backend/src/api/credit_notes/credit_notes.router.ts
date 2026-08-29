/**
 * Credit Notes Management & Redemption Router.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { db } from '../../db/client';

export const creditNotesRouter = Router();

creditNotesRouter.use(authenticate);

// GET /api/credit-notes/:code
creditNotesRouter.get('/:code', async (req, res): Promise<void> => {
  try {
    const { code } = req.params;
    const storeId = req.user?.storeId;

    let query = db('credit_notes').where('credit_note_number', code);
    if (storeId) query = query.andWhere('store_id', storeId);

    const creditNote = await query.first();
    if (!creditNote) {
      res.status(404).json({ error: 'Credit note not found', code: 'CREDIT_NOTE_NOT_FOUND' });
      return;
    }

    if (creditNote.status !== 'ACTIVE') {
      res.status(400).json({ error: `Credit note is ${creditNote.status}`, code: 'CREDIT_NOTE_INACTIVE' });
      return;
    }

    if (creditNote.expiry_date && new Date(creditNote.expiry_date) < new Date()) {
      res.status(400).json({ error: 'Credit note has expired', code: 'CREDIT_NOTE_EXPIRED' });
      return;
    }

    const remaining = parseFloat(creditNote.remaining_amount);
    if (remaining <= 0) {
      res.status(400).json({ error: 'Credit note balance is zero', code: 'CREDIT_NOTE_EXHAUSTED' });
      return;
    }

    res.json(creditNote);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify credit note' });
  }
});

// POST /api/credit-notes/redeem
creditNotesRouter.post('/redeem', async (req, res): Promise<void> => {
  try {
    const { creditNoteNumber, amountToRedeem } = req.body;
    const storeId = req.user?.storeId;

    if (!creditNoteNumber || !amountToRedeem || parseFloat(amountToRedeem) <= 0) {
      res.status(400).json({ error: 'Invalid credit note redemption parameters' });
      return;
    }

    const result = await db.transaction(async (trx) => {
      let query = trx('credit_notes').where('credit_note_number', creditNoteNumber).forUpdate();
      if (storeId) query = query.andWhere('store_id', storeId);

      const cn = await query.first();
      if (!cn) throw new Error('Credit note not found');
      if (cn.status !== 'ACTIVE') throw new Error(`Credit note is ${cn.status}`);

      const remaining = parseFloat(cn.remaining_amount);
      const redeem = parseFloat(amountToRedeem);

      if (redeem > remaining) {
        throw new Error(`Requested redemption ₹${redeem.toFixed(2)} exceeds remaining balance ₹${remaining.toFixed(2)}`);
      }

      const newRemaining = remaining - redeem;
      const newStatus = newRemaining === 0 ? 'REDEEMED' : 'ACTIVE';

      await trx('credit_notes')
        .where('id', cn.id)
        .update({
          remaining_amount: newRemaining,
          status: newStatus,
        });

      return {
        id: cn.id,
        creditNoteNumber: cn.credit_note_number,
        redeemedAmount: redeem,
        remainingBalance: newRemaining,
        status: newStatus,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to redeem credit note' });
  }
});
