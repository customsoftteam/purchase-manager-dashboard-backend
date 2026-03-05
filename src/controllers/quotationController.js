// Quotation management controller
const supabase = require('../config/supabase');

/* =========================================================
   CREATE COUNTER QUOTATION (Vendor responds to quotation)
   ========================================================= */
exports.createCounterQuotation = async (req, res) => {
  try {
    const { quotationId, action, expectedDeliveryDate, items, validTill, advancePaymentPercent, rejectionReason, negotiationNotes } = req.body;
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    if (!quotationId || !action) {
      return res.status(400).json({
        error: 'Missing required fields: quotationId, action'
      });
    }

    if (!['accept', 'reject', 'negotiate'].includes(action)) {
      return res.status(400).json({
        error: 'Action must be: accept, reject, or negotiate'
      });
    }

    // Get original quotation
    const { data: originalQuotation, error: fetchError } = await supabase
      .from('purchase_quotation')
      .select('*')
      .eq('quotation_id', quotationId)
      .single();

    if (fetchError || !originalQuotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    const counterId = `vcq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const counterNumber = `VC-${Date.now()}`;

    let totalAmount = originalQuotation.total_amount;
    let itemInserts = [];

    // If negotiating, calculate new amount from items
    if (action === 'negotiate' && items && items.length > 0) {
      totalAmount = 0;
      itemInserts = items.map((item) => {
        const cgstAmount = (item.lineTotal * (item.cgstPercent || 0)) / 100;
        const sgstAmount = (item.lineTotal * (item.sgstPercent || 0)) / 100;
        const taxAmount = cgstAmount + sgstAmount;
        const itemTotal = item.lineTotal + taxAmount;
        totalAmount += itemTotal;

        return {
          item_id: `vcqi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          counter_id: counterId,
          component_id: item.componentId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_percent: item.discountPercent || 0,
          cgst_percent: item.cgstPercent || 0,
          sgst_percent: item.sgstPercent || 0,
          tax_amount: taxAmount,
          line_total: itemTotal,
          notes: item.notes || null,
          created_at: new Date().toISOString(),
        };
      });
    }

    // Create counter quotation
    const counterStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'pending';
    const counterData = {
      counter_id: counterId,
      quotation_id: quotationId,
      vendor_id: vendorId,
      counter_number: counterNumber,
      action,
      counter_date: new Date().toISOString(),
      valid_till: validTill || null,
      expected_delivery_date: expectedDeliveryDate || null,
      total_amount: totalAmount,
      advance_payment_percent: advancePaymentPercent || originalQuotation.advance_payment_percent,
      final_payment_percent: 100 - (advancePaymentPercent || originalQuotation.advance_payment_percent),
      rejection_reason: action === 'reject' ? rejectionReason : null,
      negotiation_notes: action === 'negotiate' ? negotiationNotes : null,
      status: counterStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: counter, error: counterError } = await supabase
      .from('vendor_counter_quotation')
      .insert([counterData])
      .select()
      .single();

    if (counterError) throw counterError;

    // Insert items if negotiating
    if (itemInserts.length > 0) {
      const { error: itemsError } = await supabase
        .from('vendor_counter_quotation_items')
        .insert(itemInserts);

      if (itemsError) throw itemsError;
    }

    // Update quotation status
    const newQuotationStatus = action === 'reject' ? 'rejected' : 'negotiating';
    await supabase
      .from('purchase_quotation')
      .update({ status: newQuotationStatus, updated_at: new Date().toISOString() })
      .eq('quotation_id', quotationId);

    res.status(201).json({
      message: 'Counter quotation created successfully',
      counter,
    });
  } catch (error) {
    console.error('CREATE COUNTER QUOTATION ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to create counter quotation' });
  }
};

/* =========================================================
   CREATE PURCHASE QUOTATION (PM creates for vendor)
   ========================================================= */
exports.createPurchaseQuotation = async (req, res) => {
  try {
    const { enquiryId, companyId, vendorId, items, validTill, expectedDeliveryDate, advancePaymentPercent, notes } = req.body;
    const purchaseManagerId = req.user?.vendor_id;

    if (!enquiryId || !vendorId || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: enquiryId, vendorId, and items'
      });
    }

    const quotationId = `pq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const quotationNumber = `PQ-${Date.now()}`;

    const advancePercent = Number(advancePaymentPercent) || 0;
    if (advancePercent < 0 || advancePercent > 100) {
      return res.status(400).json({ error: 'Advance payment percent must be between 0 and 100' });
    }

    // Calculate total amount
    let totalAmount = 0;
    const itemInserts = items.map((item) => {
      // Calculate base price from quantity * unit price
      const basePrice = Number(item.quantity) * Number(item.unitPrice);
      const discountAmount = (basePrice * (Number(item.discountPercent) || 0)) / 100;
      const discountedPrice = basePrice - discountAmount;
      const cgstAmount = (discountedPrice * (Number(item.cgstPercent) || 0)) / 100;
      const sgstAmount = (discountedPrice * (Number(item.sgstPercent) || 0)) / 100;
      const taxAmount = cgstAmount + sgstAmount;
      const itemTotal = discountedPrice + taxAmount;
      totalAmount += itemTotal;

      return {
        item_id: `pqi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        quotation_id: quotationId,
        component_id: item.componentId,
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
        discount_percent: Number(item.discountPercent) || 0,
        cgst_percent: Number(item.cgstPercent) || 0,
        sgst_percent: Number(item.sgstPercent) || 0,
        tax_amount: taxAmount,
        line_total: itemTotal,
        created_at: new Date().toISOString(),
      };
    });

    // Create quotation
    const { data: quotation, error: quotationError } = await supabase
      .from('purchase_quotation')
      .insert([
        {
          quotation_id: quotationId,
          enquiry_id: enquiryId,
          vendor_id: vendorId,
          purchase_manager_id: purchaseManagerId,
          quotation_number: quotationNumber,
          quotation_date: new Date().toISOString(),
          valid_till: validTill || null,
          expected_delivery_date: expectedDeliveryDate || null,
          total_amount: totalAmount,
          advance_payment_percent: advancePercent,
          final_payment_percent: 100 - advancePercent,
          status: 'sent',
          notes: notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (quotationError) throw quotationError;

    // Insert items
    const { error: itemsError } = await supabase
      .from('purchase_quotation_items')
      .insert(itemInserts);

    if (itemsError) throw itemsError;

    // Update enquiry status
    const { error: enquiryStatusError } = await supabase
      .from('purchase_enquiry')
      .update({ status: 'quoted', updated_at: new Date().toISOString() })
      .eq('enquiry_id', enquiryId);

    if (enquiryStatusError) {
      throw enquiryStatusError;
    }

    // Fetch complete quotation
    const { data: completeQuotation } = await supabase
      .from('purchase_quotation')
      .select(`
        *,
        items:purchase_quotation_items(*)
      `)
      .eq('quotation_id', quotationId)
      .single();

    res.status(201).json({
      message: 'Purchase quotation created successfully',
      quotation: completeQuotation,
    });
  } catch (error) {
    console.error('Error creating purchase quotation:', error);
    res.status(500).json({ error: error.message || 'Failed to create quotation' });
  }
};

/* =========================================================
   CREATE VENDOR QUOTATION (Vendor responds to enquiry)
   ========================================================= */
exports.createVendorQuotation = async (req, res) => {
  try {
    const { enquiryId, items, validTill, expectedDeliveryDate, advancePaymentPercent, notes } = req.body;
    const vendorId = req.user?.vendor_id;

    if (!vendorId) {
      return res.status(401).json({ error: 'Vendor authentication required' });
    }

    if (!enquiryId || !vendorId || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: enquiryId and items'
      });
    }

    const { data: enquiry, error: enquiryError } = await supabase
      .from('purchase_enquiry')
      .select('enquiry_id, vendor_id, status, purchase_manager_id')
      .eq('enquiry_id', enquiryId)
      .limit(1)
      .maybeSingle();

    if (enquiryError) {
      throw enquiryError;
    }

    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }

    const enquiryVendorId = enquiry.vendor_id;
    const vendorMatchesById = enquiryVendorId && String(enquiryVendorId) === String(vendorId);

    if (!vendorMatchesById) {
      return res.status(403).json({ error: 'Unauthorized to quote this enquiry' });
    }

    const quotationId = `pq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const quotationNumber = `PQ-${Date.now()}`;

    const advancePercent = Number(advancePaymentPercent) || 0;
    if (advancePercent < 0 || advancePercent > 100) {
      return res.status(400).json({ error: 'Advance payment percent must be between 0 and 100' });
    }

    let totalAmount = 0;
    const itemInserts = items.map((item) => {
      // Calculate base price from quantity * unit price
      const basePrice = Number(item.quantity) * Number(item.unitPrice);
      const discountAmount = (basePrice * (Number(item.discountPercent) || 0)) / 100;
      const discountedPrice = basePrice - discountAmount;
      const cgstAmount = (discountedPrice * (Number(item.cgstPercent) || 0)) / 100;
      const sgstAmount = (discountedPrice * (Number(item.sgstPercent) || 0)) / 100;
      const taxAmount = cgstAmount + sgstAmount;
      const itemTotal = discountedPrice + taxAmount;
      totalAmount += itemTotal;

      return {
        item_id: `pqi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        quotation_id: quotationId,
        component_id: item.componentId,
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
        discount_percent: Number(item.discountPercent) || 0,
        cgst_percent: Number(item.cgstPercent) || 0,
        sgst_percent: Number(item.sgstPercent) || 0,
        tax_amount: taxAmount,
        line_total: itemTotal,
        created_at: new Date().toISOString(),
      };
    });

    const { data: quotation, error: quotationError } = await supabase
      .from('purchase_quotation')
      .insert([
        {
          quotation_id: quotationId,
          enquiry_id: enquiryId,
          vendor_id: vendorId,
          purchase_manager_id: null,
          quotation_number: quotationNumber,
          quotation_date: new Date().toISOString(),
          valid_till: validTill || null,
          expected_delivery_date: expectedDeliveryDate || null,
          total_amount: totalAmount,
          advance_payment_percent: advancePercent,
          final_payment_percent: 100 - advancePercent,
          status: 'sent',
          notes: notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (quotationError) throw quotationError;

    const { error: itemsError } = await supabase
      .from('purchase_quotation_items')
      .insert(itemInserts);

    if (itemsError) throw itemsError;

    const { error: vendorEnquiryStatusError } = await supabase
      .from('purchase_enquiry')
      .update({ status: 'quoted', updated_at: new Date().toISOString() })
      .eq('enquiry_id', enquiryId);

    if (vendorEnquiryStatusError) {
      throw vendorEnquiryStatusError;
    }

    // Fetch complete quotation
    const { data: completeQuotation } = await supabase
      .from('purchase_quotation')
      .select(`
        *,
        items:purchase_quotation_items(*)
      `)
      .eq('quotation_id', quotationId)
      .single();

    res.status(201).json({
      message: 'Vendor quotation created successfully',
      quotation: completeQuotation,
    });
  } catch (error) {
    console.error('Error creating vendor quotation:', error);
    res.status(500).json({ error: error.message || 'Failed to create quotation' });
  }
};

/* =========================================================
   GET PURCHASE QUOTATION BY ID
   ========================================================= */
exports.getPurchaseQuotation = async (req, res) => {
  try {
    const { quotationId } = req.params;

    const { data: quotation, error } = await supabase
      .from('purchase_quotation')
      .select(`
        *,
        items:purchase_quotation_items(*)
      `)
      .eq('quotation_id', quotationId)
      .single();

    if (error || !quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    res.json({ quotation });
  } catch (error) {
    console.error('GET QUOTATION ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quotation' });
  }
};

/* =========================================================
   GET ALL PURCHASE QUOTATIONS
   ========================================================= */
exports.getPurchaseQuotations = async (req, res) => {
  try {
    const { vendorId, enquiryId, status } = req.query;

    let query = supabase
      .from('purchase_quotation')
      .select(`
        *,
        items:purchase_quotation_items(*)
      `);

    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (enquiryId) query = query.eq('enquiry_id', enquiryId);
    if (status) query = query.eq('status', status);

    const { data: quotations, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      quotations: quotations || [],
      total: quotations?.length || 0,
    });
  } catch (error) {
    console.error('GET QUOTATIONS ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch quotations' });
  }
};

/* =========================================================
   UPDATE PURCHASE QUOTATION
   ========================================================= */
exports.updatePurchaseQuotation = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const { status, expectedDeliveryDate, notes } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (expectedDeliveryDate) updates.expected_delivery_date = expectedDeliveryDate;
    if (notes) updates.notes = notes;

    const { data: quotation, error } = await supabase
      .from('purchase_quotation')
      .update(updates)
      .eq('quotation_id', quotationId)
      .select()
      .single();

    if (error || !quotation) {
      return res.status(404).json({ error: 'Quotation not found' });
    }

    res.json({
      message: 'Quotation updated successfully',
      quotation,
    });
  } catch (error) {
    console.error('UPDATE QUOTATION ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to update quotation' });
  }
};

/* =========================================================
   GET ALL COUNTER QUOTATIONS
   ========================================================= */
exports.getCounterQuotations = async (req, res) => {
  try {
    const { vendorId, quotationId, status } = req.query;

    let query = supabase
      .from('vendor_counter_quotation')
      .select(`
        *,
        items:vendor_counter_quotation_items(*)
      `);

    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (quotationId) query = query.eq('quotation_id', quotationId);
    if (status) query = query.eq('status', status);

    const { data: counters, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      counters: counters || [],
      total: counters?.length || 0,
    });
  } catch (error) {
    console.error('GET COUNTER QUOTATIONS ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch counter quotations' });
  }
};

/* =========================================================
   UPDATE COUNTER QUOTATION
   ========================================================= */
exports.updateCounterQuotation = async (req, res) => {
  try {
    const { counterId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const { data: counter, error } = await supabase
      .from('vendor_counter_quotation')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('counter_id', counterId)
      .select()
      .single();

    if (error || !counter) {
      return res.status(404).json({ error: 'Counter quotation not found' });
    }

    // If counter accepted, update original quotation status
    if (status === 'accepted') {
      await supabase
        .from('purchase_quotation')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('quotation_id', counter.quotation_id);
    }

    res.json({
      message: 'Counter quotation updated successfully',
      counter,
    });
  } catch (error) {
    console.error('UPDATE COUNTER QUOTATION ERROR:', error);
    res.status(500).json({ error: error.message || 'Failed to update counter quotation' });
  }
};

