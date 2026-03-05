// Invoice controller (merged from vendorInvoiceController)
const supabase = require('../config/supabase');

/**
 * Create Invoice
 * Vendor creates invoice with tax details
 */
exports.createInvoice = async (req, res) => {
  try {
    const { orderId, items, notes } = req.body;
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    // Validation
    if (!orderId || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: orderId and items'
      });
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

    if (String(order.vendor_id) !== String(vendorId)) {
      return res.status(403).json({ error: 'Unauthorized to invoice this order' });
    }

    if (order.status !== 'confirmed') {
      return res.status(400).json({ error: 'Order must be confirmed before invoicing' });
    }

    const { data: existingInvoices, error: existingInvoiceError } = await supabase
      .from('vendor_invoice')
      .select('invoice_id')
      .eq('order_id', orderId);

    if (existingInvoiceError) throw existingInvoiceError;

    if ((existingInvoices || []).length > 0) {
      return res.status(400).json({ error: 'Invoice already exists for this order' });
    }

    const invoiceId = `vi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const invoiceNumber = `INV-${Date.now()}`;

    const componentIds = items.map((item) => item.componentId).filter(Boolean);
    const { data: componentRows, error: componentError } = await supabase
      .from('vendor_components')
      .select('componentid, stock_available, component_name')
      .in('componentid', componentIds);

    if (componentError) throw componentError;

    const componentMap = (componentRows || []).reduce((acc, component) => {
      acc[component.componentid] = component;
      return acc;
    }, {});

    for (const item of items) {
      const component = componentMap[item.componentId];
      if (!component) {
        return res.status(400).json({ error: 'Component not found for invoice items' });
      }
      const availableStock = Number(component.stock_available ?? 0);
      if (availableStock < Number(item.quantity)) {
        return res.status(400).json({
          error: `Insufficient stock for ${component.component_name || 'component'}`,
        });
      }
    }

    // Calculate invoice totals
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalDiscount = 0;
    let totalAmount = 0;

    const itemInserts = items.map((item) => {
      const baseTotal = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
      const discountAmount = (baseTotal * (item.discountPercent || 0)) / 100;
      const discountedPrice = baseTotal - discountAmount;
      const cgstAmount = (discountedPrice * (item.cgstPercent || 0)) / 100;
      const sgstAmount = (discountedPrice * (item.sgstPercent || 0)) / 100;
      const itemTotal = discountedPrice + cgstAmount + sgstAmount;

      subtotal += baseTotal;
      totalDiscount += discountAmount;
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
      totalAmount += itemTotal;

      return {
        item_id: `vii_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        invoice_id: invoiceId,
        order_item_id: item.orderItemId || null,
        component_id: item.componentId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_percent: item.discountPercent || 0,
        discount_amount: discountAmount,
        cgst_percent: item.cgstPercent || 0,
        cgst_amount: cgstAmount,
        sgst_percent: item.sgstPercent || 0,
        sgst_amount: sgstAmount,
        line_total: itemTotal,
        created_at: new Date().toISOString(),
      };
    });

    // Create invoice
    const { data: invoice, error } = await supabase
      .from('vendor_invoice')
      .insert([
        {
          invoice_id: invoiceId,
          order_id: orderId,
          vendor_id: vendorId,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString(),
          subtotal,
          total_cgst: totalCgst,
          total_sgst: totalSgst,
          total_discount: totalDiscount,
          total_amount: totalAmount,
          status: 'pending',
          notes: notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Insert invoice items
    const { error: itemsError } = await supabase
      .from('vendor_invoice_items')
      .insert(itemInserts);

    if (itemsError) throw itemsError;

    await Promise.all(
      items.map(async (item) => {
        const component = componentMap[item.componentId];
        const currentStock = Number(component.stock_available ?? 0);
        const nextStock = Math.max(0, currentStock - Number(item.quantity));
        const { error: stockError } = await supabase
          .from('vendor_components')
          .update({
            stock_available: nextStock,
            updated_at: new Date().toISOString(),
          })
          .eq('componentid', item.componentId);

        if (stockError) throw stockError;
      })
    );

    // Fetch complete invoice
    const { data: completeInvoice } = await supabase
      .from('vendor_invoice')
      .select(`
        *,
        items:vendor_invoice_items(*)
      `)
      .eq('invoice_id', invoiceId)
      .single();

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice: completeInvoice,
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to create invoice' });
  }
};

/**
 * Get Invoice by ID
 */
exports.getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const { data: invoice, error } = await supabase
      .from('vendor_invoice')
      .select(`
        *,
        items:vendor_invoice_items(*)
      `)
      .eq('invoice_id', invoiceId)
      .single();

    if (error || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch invoice' });
  }
};

/**
 * Get all Invoices
 */
exports.getInvoices = async (req, res) => {
  try {
    const { orderId, vendorId, status } = req.query;

    let query = supabase
      .from('vendor_invoice')
      .select(`
        *,
        items:vendor_invoice_items(*)
      `);

    if (orderId) query = query.eq('order_id', orderId);
    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (status) query = query.eq('status', status);

    const { data: invoices, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      invoices: invoices || [],
      total: invoices?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch invoices' });
  }
};

/**
 * Update Invoice Status - Received
 */
exports.markInvoiceReceived = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const { data: invoice, error: fetchError } = await supabase
      .from('vendor_invoice')
      .select('*')
      .eq('invoice_id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { data: updated, error } = await supabase
      .from('vendor_invoice')
      .update({
        status: 'received',
        updated_at: new Date().toISOString(),
      })
      .eq('invoice_id', invoiceId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Invoice marked as received',
      invoice: updated,
    });
  } catch (error) {
    console.error('Error marking invoice as received:', error);
    res.status(500).json({ error: error.message || 'Failed to mark invoice as received' });
  }
};

/**
 * Update Invoice Status - Accepted
 */
exports.acceptInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const { data: invoice, error: fetchError } = await supabase
      .from('vendor_invoice')
      .select('*')
      .eq('invoice_id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { data: updated, error } = await supabase
      .from('vendor_invoice')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('invoice_id', invoiceId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Invoice accepted',
      invoice: updated,
    });
  } catch (error) {
    console.error('Error accepting invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to accept invoice' });
  }
};

/**
 * Update Invoice Status - Rejected
 */
exports.rejectInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { notes } = req.body;

    const { data: invoice, error: fetchError } = await supabase
      .from('vendor_invoice')
      .select('*')
      .eq('invoice_id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const updateData = {
      status: 'rejected',
      updated_at: new Date().toISOString(),
    };

    if (notes) updateData.notes = notes;

    const { data: updated, error } = await supabase
      .from('vendor_invoice')
      .update(updateData)
      .eq('invoice_id', invoiceId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Invoice rejected',
      invoice: updated,
    });
  } catch (error) {
    console.error('Error rejecting invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to reject invoice' });
  }
};

/**
 * Update Invoice Status - Paid
 */
exports.markInvoicePaid = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const { data: invoice, error: fetchError } = await supabase
      .from('vendor_invoice')
      .select('*')
      .eq('invoice_id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { data: payments, error: paymentsError } = await supabase
      .from('purchase_payment')
      .select('amount, status')
      .eq('order_id', invoice.order_id)
      .neq('status', 'failed');

    if (paymentsError) throw paymentsError;

    const totalPaid = (payments || []).reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
    const totalAmount = parseFloat(invoice.total_amount || 0);

    if (totalPaid + 0.01 < totalAmount) {
      return res.status(400).json({
        error: `Invoice cannot be closed until total amount is paid. Paid: ${totalPaid.toFixed(2)}`,
      });
    }

    const { data: updated, error } = await supabase
      .from('vendor_invoice')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('invoice_id', invoiceId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Invoice marked as paid',
      invoice: updated,
    });
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    res.status(500).json({ error: error.message || 'Failed to mark invoice as paid' });
  }
};

/**
 * Get Invoice Summary
 */
exports.getInvoiceSummary = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const { data: invoice, error } = await supabase
      .from('vendor_invoice')
      .select(`
        *,
        items:vendor_invoice_items(*)
      `)
      .eq('invoice_id', invoiceId)
      .single();

    if (error || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const summary = {
      invoiceId: invoice.invoice_id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      orderId: invoice.order_id,
      vendorId: invoice.vendor_id,
      subtotal: invoice.subtotal,
      totalDiscount: invoice.total_discount,
      totalCGST: invoice.total_cgst,
      totalSGST: invoice.total_sgst,
      totalAmount: invoice.total_amount,
      status: invoice.status,
      itemCount: invoice.items?.length || 0,
      items: invoice.items || [],
    };

    res.json({ summary });
  } catch (error) {
    console.error('Error getting invoice summary:', error);
    res.status(500).json({ error: error.message || 'Failed to get invoice summary' });
  }
};
