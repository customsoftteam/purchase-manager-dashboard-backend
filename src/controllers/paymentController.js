// Purchase payment controller
const supabase = require('../config/supabase');

/**
 * Create Payment Record
 * PM initiates payment for order
 */
exports.createPayment = async (req, res) => {
  try {
    const { orderId, phase, amount, paymentMode, dueDate } = req.body;
    const purchaseManagerId = req.user?.vendor_id;
    const normalizedPaymentMode = paymentMode
      ? String(paymentMode).trim().toLowerCase().replace(/\s+/g, '_')
      : null;
    const allowedPaymentModes = ['bank_transfer', 'cheque', 'upi', 'cash', 'credit_card', 'other'];
    const safePaymentMode = allowedPaymentModes.includes(normalizedPaymentMode) ? normalizedPaymentMode : null;

    // Validation
    if (!orderId || !phase || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: orderId, phase, amount'
      });
    }

    if (!['advance', 'installment', 'final'].includes(phase)) {
      return res.status(400).json({
        error: 'Phase must be one of: advance, installment, final'
      });
    }

    const amountValue = parseFloat(amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: 'Amount must be a valid number' });
    }

    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
      return res.status(400).json({ error: 'Due date must be a valid date' });
    }

    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from('purchase_order')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!['confirmed', 'completed'].includes(order.status)) {
      return res.status(400).json({ error: 'Order must be confirmed before initiating payment' });
    }

    const { data: invoices, error: invoiceError } = await supabase
      .from('vendor_invoice')
      .select('invoice_id, status, total_amount, created_at')
      .eq('order_id', orderId)
      .neq('status', 'rejected');

    if (invoiceError) throw invoiceError;

    if (!invoices || invoices.length === 0) {
      return res.status(400).json({ error: 'Invoice required before initiating payment' });
    }

    const latestInvoice = (invoices || [])
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
    const totalTarget = parseFloat(latestInvoice?.total_amount || order.total_amount || 0);

    // Calculate total paid so far
    const { data: existingPayments, error: paymentsError } = await supabase
      .from('purchase_payment')
      .select('amount, status')
      .eq('order_id', orderId)
      .neq('status', 'failed');

    if (paymentsError) throw paymentsError;

    const totalPaid = (existingPayments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const remaining = totalTarget - totalPaid;

    // Validate amount doesn't exceed remaining
    if (amountValue > remaining + 0.01) {
      return res.status(400).json({
        error: `Amount exceeds remaining balance. Remaining: ${remaining.toFixed(2)}`
      });
    }

    const paymentId = `pp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const vendorId = order.vendor_id;

    // Create payment
    const { data: payment, error } = await supabase
      .from('purchase_payment')
      .insert([
        {
          payment_id: paymentId,
          order_id: orderId,
          vendor_id: vendorId,
          purchase_manager_id: purchaseManagerId,
          phase,
          amount,
          payment_mode: safePaymentMode,
          due_date: dueDate || null,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Payment initiated successfully',
      payment,
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment' });
  }
};

/**
 * Get Payment by ID
 */
exports.getPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const { data: payment, error } = await supabase
      .from('purchase_payment')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payment' });
  }
};

/**
 * Get all Payments
 */
exports.getPayments = async (req, res) => {
  try {
    const { orderId, vendorId, status, phase } = req.query;

    let query = supabase
      .from('purchase_payment')
      .select('*');

    if (orderId) query = query.eq('order_id', orderId);
    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (status) query = query.eq('status', status);
    if (phase) query = query.eq('phase', phase);

    const { data: payments, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      payments: payments || [],
      total: payments?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payments' });
  }
};

/**
 * Update Payment Status - Mark as Completed
 */
exports.completePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { referenceNumber, paymentDate } = req.body;

    const { data: payment, error: fetchError } = await supabase
      .from('purchase_payment')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const updateData = {
      status: 'completed',
      payment_date: paymentDate || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (referenceNumber) updateData.reference_number = referenceNumber;

    const { data: updated, error } = await supabase
      .from('purchase_payment')
      .update(updateData)
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) throw error;

    // Check if all payments for order are completed
    const { data: allPayments } = await supabase
      .from('purchase_payment')
      .select('*')
      .eq('order_id', payment.order_id);

    const allCompleted = allPayments?.every(p => p.status === 'completed' || p.payment_id === paymentId);

    const totalPaid = (allPayments || [])
      .filter((entry) => entry.status !== 'failed')
      .reduce((sum, entry) => sum + parseFloat(entry.amount || 0), 0);

    const { data: invoiceForTotal } = await supabase
      .from('vendor_invoice')
      .select('invoice_id, total_amount, created_at')
      .eq('order_id', payment.order_id)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: orderForTotal } = await supabase
      .from('purchase_order')
      .select('total_amount')
      .eq('order_id', payment.order_id)
      .maybeSingle();

    const totalTarget = parseFloat(invoiceForTotal?.total_amount || 0) || parseFloat(orderForTotal?.total_amount || 0);

    // Update order status if all payments completed
    if (allCompleted && totalPaid + 0.01 >= totalTarget) {
      await supabase
        .from('purchase_order')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('order_id', payment.order_id);
    }

    if (totalPaid > 0) {
      const { data: invoice } = await supabase
        .from('vendor_invoice')
        .select('invoice_id, total_amount, status')
        .eq('order_id', payment.order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invoice) {
        const totalAmount = parseFloat(invoice.total_amount || 0);
        if (totalPaid + 0.01 >= totalAmount && invoice.status !== 'paid') {
          await supabase
            .from('vendor_invoice')
            .update({ status: 'paid', updated_at: new Date().toISOString() })
            .eq('invoice_id', invoice.invoice_id);
        }
      }
    }

    res.json({
      message: 'Payment completed successfully',
      payment: updated,
    });
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message || 'Failed to complete payment' });
  }
};

/**
 * Update Payment Status - Mark as Failed
 */
exports.failPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;

    const { data: updated, error } = await supabase
      .from('purchase_payment')
      .update({
        status: 'failed',
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Payment marked as failed',
      payment: updated,
    });
  } catch (error) {
    console.error('Error failing payment:', error);
    res.status(500).json({ error: error.message || 'Failed to mark payment as failed' });
  }
};

/**
 * Vendor confirms payment received
 */
exports.sendPaymentReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const vendorId = req.user?.vendor_id;
    const { receiptReference } = req.body;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    const { data: payment, error: fetchError } = await supabase
      .from('purchase_payment')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (String(payment.vendor_id) !== String(vendorId)) {
      return res.status(403).json({ error: 'Unauthorized to confirm this payment' });
    }

    const { data: updated, error } = await supabase
      .from('purchase_payment')
      .update({
        status: 'receipt_sent',
        notes: receiptReference || null,
        updated_at: new Date().toISOString(),
      })
      .eq('payment_id', paymentId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Payment receipt sent',
      payment: updated,
    });
  } catch (error) {
    console.error('Error sending payment receipt:', error);
    res.status(500).json({ error: error.message || 'Failed to send payment receipt' });
  }
};

/**
 * Get Payment Summary for Order
 */
exports.getOrderPaymentSummary = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Get order
    const { data: order, error: orderError } = await supabase
      .from('purchase_order')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get all payments (exclude failed)
    const { data: payments, error: paymentsError } = await supabase
      .from('purchase_payment')
      .select('*')
      .eq('order_id', orderId)
      .neq('status', 'failed');

    if (paymentsError) throw paymentsError;

    // Calculate summary
    const totalPaid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const remaining = parseFloat(order.total_amount) - totalPaid;
    const advancePercent = order.advance_payment_percent || 0;
    const { data: invoiceForTotal } = await supabase
      .from('vendor_invoice')
      .select('total_amount, created_at')
      .eq('order_id', orderId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const invoiceTotal = parseFloat(invoiceForTotal?.total_amount || 0);
    const baseTotal = invoiceTotal || parseFloat(order.total_amount || 0);
    const advanceAmount = parseFloat(order.advance_amount) || (baseTotal * advancePercent / 100);

    const advance = payments?.find(p => p.phase === 'advance') || null;
    const installmentPayments = (payments || []).filter(p => p.phase === 'installment');
    const installmentTotal = installmentPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const final = payments?.find(p => p.phase === 'final') || null;
    const finalExpected = Math.max(0, baseTotal - advanceAmount - installmentTotal);

    const summary = {
      orderId,
      orderAmount: baseTotal,
      totalPaid,
      remaining: baseTotal - totalPaid,
      advancePayment: {
        expected: advanceAmount,
        actual: advance?.amount || 0,
        status: advance?.status || 'pending',
        paymentId: advance?.payment_id || null,
      },
      installmentPayment: {
        total: installmentTotal,
        count: installmentPayments.length,
      },
      finalPayment: {
        expected: finalExpected,
        actual: final?.amount || 0,
        status: final?.status || 'pending',
        paymentId: final?.payment_id || null,
      },
      allPaymentsCompleted: remaining <= 0.01,
    };

    res.json({ summary });
  } catch (error) {
    console.error('Error getting payment summary:', error);
    res.status(500).json({ error: error.message || 'Failed to get payment summary' });
  }
};
