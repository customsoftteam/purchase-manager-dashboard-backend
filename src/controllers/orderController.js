// Purchase order controller
const supabase = require('../config/supabase');

/**
 * Create Purchase Order
 * PM creates order after LOI acceptance
 */
exports.createPurchaseOrder = async (req, res) => {
  try {
    const { loiId, items: providedItems, expectedDeliveryDate, termsAndConditions } = req.body;
    const purchaseManagerId = req.user?.vendor_id;

    // Validation
    if (!loiId) {
      return res.status(400).json({
        error: 'Missing required field: loiId'
      });
    }

    // Get LOI details
    const { data: loi, error: loiError } = await supabase
      .from('purchase_loi')
      .select('*')
      .eq('loi_id', loiId)
      .single();

    if (loiError || !loi || loi.status !== 'accepted') {
      return res.status(400).json({ error: 'LOI must be accepted before creating order' });
    }

    const orderId = `po_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const orderNumber = `PO-${Date.now()}`;

    const vendorId = loi.vendor_id;

    // If items not provided, fetch from quotation
    let orderItems = providedItems;
    if (!orderItems || orderItems.length === 0) {
      const quotationId = loi.counter_quotation_id || loi.quotation_id;
      
      if (!quotationId) {
        return res.status(400).json({ error: 'No quotation linked to LOI and no items provided' });
      }

      // Fetch quotation items
      const { data: quotationItems, error: quotationError } = await supabase
        .from('purchase_quotation_items')
        .select('*')
        .eq('quotation_id', quotationId);

      if (quotationError || !quotationItems || quotationItems.length === 0) {
        return res.status(400).json({ error: 'No items found in quotation' });
      }

      // Map quotation items to order items format
      orderItems = quotationItems.map(item => ({
        componentId: item.component_id,
        componentName: item.component_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        discountPercent: item.discount_percent || 0,
        cgstPercent: item.cgst_percent || 0,
        sgstPercent: item.sgst_percent || 0,
      }));
    }

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ error: 'No items available for order creation' });
    }

    // Calculate totals
    let totalAmount = 0;
    const itemInserts = orderItems.map((item, index) => {
      const baseAmount = (item.quantity || 0) * (item.unitPrice || 0);
      const discountAmount = (baseAmount * (item.discountPercent || 0)) / 100;
      const discountedPrice = baseAmount - discountAmount;
      const cgstAmount = (discountedPrice * (item.cgstPercent || 0)) / 100;
      const sgstAmount = (discountedPrice * (item.sgstPercent || 0)) / 100;
      const taxAmount = cgstAmount + sgstAmount;
      const itemTotal = discountedPrice + taxAmount;
      totalAmount += itemTotal;

      return {
        item_id: `poi_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        order_id: orderId,
        component_id: item.componentId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_percent: item.discountPercent || 0,
        cgst_percent: item.cgstPercent || 0,
        sgst_percent: item.sgstPercent || 0,
        tax_amount: taxAmount,
        line_total: itemTotal,
        created_at: new Date().toISOString(),
      };
    });

    const advanceAmount = (totalAmount * (loi.advance_payment_percent || 0)) / 100;
    const finalAmount = totalAmount - advanceAmount;

    // Create order
    const { data: order, error } = await supabase
      .from('purchase_order')
      .insert([
        {
          order_id: orderId,
          loi_id: loiId,
          vendor_id: vendorId,
          purchase_manager_id: purchaseManagerId,
          order_number: orderNumber,
          order_date: new Date().toISOString(),
          total_amount: totalAmount,
          advance_amount: advanceAmount,
          final_amount: finalAmount,
          expected_delivery_date: expectedDeliveryDate || loi.expected_delivery_date,
          status: 'pending',
          terms_and_conditions: termsAndConditions || loi.terms_and_conditions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Insert order items
    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(itemInserts);

    if (itemsError) throw itemsError;

    // Update LOI status
    await supabase
      .from('purchase_loi')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('loi_id', loiId);

    // Fetch complete order
    const { data: completeOrder } = await supabase
      .from('purchase_order')
      .select(`
        *,
        items:purchase_order_items(*)
      `)
      .eq('order_id', orderId)
      .single();

    res.status(201).json({
      message: 'Purchase order created successfully',
      order: completeOrder,
    });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: error.message || 'Failed to create purchase order' });
  }
};

/**
 * Get Purchase Order by ID
 */
exports.getPurchaseOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data: order, error } = await supabase
      .from('purchase_order')
      .select(`
        *,
        items:purchase_order_items(*)
      `)
      .eq('order_id', orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch order' });
  }
};

/**
 * Get all Purchase Orders
 */
exports.getPurchaseOrders = async (req, res) => {
  try {
    const { vendorId, status, loiId } = req.query;

    let query = supabase
      .from('purchase_order')
      .select(`
        *,
        items:purchase_order_items(*),
        invoice:vendor_invoice(invoice_id, invoice_number, status, total_amount)
      `);

    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (status) query = query.eq('status', status);
    if (loiId) query = query.eq('loi_id', loiId);

    const { data: orders, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      orders: orders || [],
      total: orders?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch orders' });
  }
};

/**
 * Update Purchase Order Status
 */
exports.updatePurchaseOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'partially_received', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Allowed: pending, confirmed, partially_received, completed, cancelled'
      });
    }

    const { data: order, error } = await supabase
      .from('purchase_order')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Order status updated successfully',
      order,
    });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ error: error.message || 'Failed to update order' });
  }
};

/**
 * Vendor Confirms Order
 */
exports.vendorConfirmOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    const { data: order, error: fetchError } = await supabase
      .from('purchase_order')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify vendor
    if (String(order.vendor_id) !== String(vendorId)) {
      return res.status(403).json({ error: 'Unauthorized to confirm this order' });
    }

    const { data: updated, error } = await supabase
      .from('purchase_order')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Order confirmed successfully',
      order: updated,
    });
  } catch (error) {
    console.error('Error confirming order:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm order' });
  }
};

/**
 * Delete Purchase Order
 */
exports.deletePurchaseOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Get order
    const { data: order, error: fetchError } = await supabase
      .from('purchase_order')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only pending orders can be deleted
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending orders can be deleted' });
    }

    // Delete order items
    await supabase
      .from('purchase_order_items')
      .delete()
      .eq('order_id', orderId);

    // Delete order
    const { error } = await supabase
      .from('purchase_order')
      .delete()
      .eq('order_id', orderId);

    if (error) throw error;

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ error: error.message || 'Failed to delete order' });
  }
};
