// Inventory management controller
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Update Stock/Inventory
exports.updateInventory = async (req, res) => {
  try {
    const { productId, quantity_on_hand, quantity_reserved, location } = req.body;

    if (!productId || quantity_on_hand === undefined) {
      return res.status(400).json({ error: 'Product ID and quantity_on_hand are required' });
    }

    // Check if inventory exists
    const { data: existing, error: checkError} = await supabase
      .from('Inventory')
      .select('inventoryId')
      .eq('productId', productId)
      .single();

    let data, error;

    if (existing) {
      // Update existing inventory
      const result = await supabase
        .from('Inventory')
        .update({
          quantity_on_hand: parseInt(quantity_on_hand),
          quantity_reserved: quantity_reserved ? parseInt(quantity_reserved) : 0,
          location: location || null,
          updated_at: new Date().toISOString(),
        })
        .eq('productId', productId)
        .select();

      data = result.data;
      error = result.error;
    } else {
      // Insert new inventory
      const result = await supabase
        .from('Inventory')
        .insert([
          {
            inventoryId: uuidv4(),
            productId,
            quantity_on_hand: parseInt(quantity_on_hand),
            quantity_reserved: quantity_reserved ? parseInt(quantity_reserved) : 0,
            location: location || 'Warehouse A',
            updated_at: new Date().toISOString(),
          },
        ])
        .select();

      data = result.data;
      error = result.error;
    }

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Inventory updated successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Inventory for Product
exports.getProductInventory = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from('Inventory')
      .select('*')
      .eq('productId', productId)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Inventory not found for this product' });
    }

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get All Inventory
exports.getAllInventory = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Inventory')
      .select(`
        *,
        Products(title, Item_no)
      `)
      .order('updated_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Reserve Inventory
exports.reserveInventory = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
      return res.status(400).json({ error: 'Product ID and quantity are required' });
    }

    const { data: inventory, error: fetchError } = await supabase
      .from('Inventory')
      .select('quantity_reserved, quantity_on_hand')
      .eq('productId', productId)
      .single();

    if (fetchError) return res.status(404).json({ error: 'Product inventory not found' });

    const newReserved = inventory.quantity_reserved + parseInt(quantity);

    if (newReserved > inventory.quantity_on_hand) {
      return res.status(400).json({ error: 'Insufficient inventory to reserve' });
    }

    const { data, error } = await supabase
      .from('Inventory')
      .update({
        quantity_reserved: newReserved,
        updated_at: new Date().toISOString(),
      })
      .eq('productId', productId)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Inventory reserved successfully', data: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Low Stock Products
exports.getLowStockProducts = async (req, res) => {
  try {
    const threshold = req.query.threshold || 10;

    const { data, error } = await supabase
      .from('Inventory')
      .select(`
        *,
        Products(title, Item_no)
      `)
      .lt('quantity_on_hand', parseInt(threshold));

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
