// firestoreService.js
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch
} from "firebase/firestore";
import { db } from "./firebase";

// ====================================
// PRODUCTS MANAGEMENT
// ====================================

/**
 * Add a new product (Admin only)
 */
export const addProduct = async (productData) => {
  try {
    const productId = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const product = {
      id: productId,
      ...productData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "products", productId), product);

    return {
      success: true,
      productId: productId,
      message: "Product added successfully!"
    };
  } catch (error) {
    console.error("Error adding product:", error);
    return {
      success: false,
      message: "Failed to add product.",
      error: error.message
    };
  }
};

/**
 * Get all products
 */
export const getAllProducts = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "products"));
    const products = [];
    
    querySnapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return products;
  } catch (error) {
    console.error("Error getting products:", error);
    return [];
  }
};

/**
 * Get product by ID
 */
export const getProductById = async (productId) => {
  try {
    const docSnap = await getDoc(doc(db, "products", productId));
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error getting product:", error);
    return null;
  }
};

/**
 * Update product (Admin only)
 */
export const updateProduct = async (productId, updates) => {
  try {
    await updateDoc(doc(db, "products", productId), {
      ...updates,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Product updated successfully!"
    };
  } catch (error) {
    console.error("Error updating product:", error);
    return {
      success: false,
      message: "Failed to update product.",
      error: error.message
    };
  }
};

/**
 * Delete product (Admin only)
 */
export const deleteProduct = async (productId) => {
  try {
    await deleteDoc(doc(db, "products", productId));

    return {
      success: true,
      message: "Product deleted successfully!"
    };
  } catch (error) {
    console.error("Error deleting product:", error);
    return {
      success: false,
      message: "Failed to delete product.",
      error: error.message
    };
  }
};

// ====================================
// CART MANAGEMENT
// ====================================

/**
 * Get user's cart
 */
export const getUserCart = async (userId) => {
  try {
    const docSnap = await getDoc(doc(db, "carts", userId));
    
    if (docSnap.exists()) {
      return docSnap.data().items || [];
    }
    
    return [];
  } catch (error) {
    console.error("Error getting cart:", error);
    return [];
  }
};

/**
 * Add item to cart
 */
export const addToCart = async (userId, productId, quantity = 1) => {
  try {
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    
    let items = [];
    
    if (cartSnap.exists()) {
      items = cartSnap.data().items || [];
    }

    // Check if item already exists
    const existingIndex = items.findIndex(item => item.id === productId);
    
    if (existingIndex !== -1) {
      items[existingIndex].quantity += quantity;
    } else {
      items.push({ id: productId, quantity: quantity });
    }

    await setDoc(cartRef, {
      items: items,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Added to cart!"
    };
  } catch (error) {
    console.error("Error adding to cart:", error);
    return {
      success: false,
      message: "Failed to add to cart.",
      error: error.message
    };
  }
};

/**
 * Update cart item quantity
 */
export const updateCartItemQuantity = async (userId, productId, quantity) => {
  try {
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    
    if (!cartSnap.exists()) {
      return { success: false, message: "Cart not found." };
    }

    let items = cartSnap.data().items || [];
    const itemIndex = items.findIndex(item => item.id === productId);
    
    if (itemIndex !== -1) {
      if (quantity <= 0) {
        items.splice(itemIndex, 1);
      } else {
        items[itemIndex].quantity = quantity;
      }
    }

    await setDoc(cartRef, {
      items: items,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Cart updated!"
    };
  } catch (error) {
    console.error("Error updating cart:", error);
    return {
      success: false,
      message: "Failed to update cart.",
      error: error.message
    };
  }
};

/**
 * Remove item from cart
 */
export const removeFromCart = async (userId, productId) => {
  try {
    const cartRef = doc(db, "carts", userId);
    const cartSnap = await getDoc(cartRef);
    
    if (!cartSnap.exists()) {
      return { success: false, message: "Cart not found." };
    }

    let items = cartSnap.data().items || [];
    items = items.filter(item => item.id !== productId);

    await setDoc(cartRef, {
      items: items,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Removed from cart!"
    };
  } catch (error) {
    console.error("Error removing from cart:", error);
    return {
      success: false,
      message: "Failed to remove from cart.",
      error: error.message
    };
  }
};

/**
 * Clear cart
 */
export const clearCart = async (userId) => {
  try {
    await setDoc(doc(db, "carts", userId), {
      items: [],
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Cart cleared!"
    };
  } catch (error) {
    console.error("Error clearing cart:", error);
    return {
      success: false,
      message: "Failed to clear cart.",
      error: error.message
    };
  }
};

// ====================================
// ORDERS MANAGEMENT
// ====================================

/**
 * Create new order
 */
export const createOrder = async (userId, orderData) => {
  try {
    const orderId = `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const order = {
      orderId: orderId,
      userId: userId,
      email: orderData.email,
      name: orderData.name,
      address: orderData.address,
      phone: orderData.phone,
      items: orderData.items,
      total: orderData.total,
      status: "Processing",
      paymentMethod: orderData.paymentMethod || "COD",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "orders", orderId), order);

    // Clear user's cart after order
    await clearCart(userId);

    // Update product stock
    const batch = writeBatch(db);
    for (const item of orderData.items) {
      const productRef = doc(db, "products", item.id);
      batch.update(productRef, {
        stock: increment(-item.quantity)
      });
    }
    await batch.commit();

    return {
      success: true,
      orderId: orderId,
      message: "Order placed successfully!"
    };
  } catch (error) {
    console.error("Error creating order:", error);
    return {
      success: false,
      message: "Failed to place order.",
      error: error.message
    };
  }
};

/**
 * Get user's orders
 */
export const getUserOrders = async (userId) => {
  try {
    const q = query(
      collection(db, "orders"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const orders = [];
    
    querySnapshot.forEach((doc) => {
      orders.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return orders;
  } catch (error) {
    console.error("Error getting user orders:", error);
    return [];
  }
};

/**
 * Get all orders (Admin only)
 */
export const getAllOrders = async () => {
  try {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const orders = [];
    
    querySnapshot.forEach((doc) => {
      orders.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return orders;
  } catch (error) {
    console.error("Error getting all orders:", error);
    return [];
  }
};

/**
 * Get order by ID
 */
export const getOrderById = async (orderId) => {
  try {
    const docSnap = await getDoc(doc(db, "orders", orderId));
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error getting order:", error);
    return null;
  }
};

/**
 * Update order status (Admin only)
 */
export const updateOrderStatus = async (orderId, status) => {
  try {
    await updateDoc(doc(db, "orders", orderId), {
      status: status,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Order status updated!"
    };
  } catch (error) {
    console.error("Error updating order status:", error);
    return {
      success: false,
      message: "Failed to update order status.",
      error: error.message
    };
  }
};

// ====================================
// WISHLIST MANAGEMENT
// ====================================

/**
 * Get user's wishlist
 */
export const getUserWishlist = async (userId) => {
  try {
    const docSnap = await getDoc(doc(db, "wishlists", userId));
    
    if (docSnap.exists()) {
      return docSnap.data().items || [];
    }
    
    return [];
  } catch (error) {
    console.error("Error getting wishlist:", error);
    return [];
  }
};

/**
 * Add to wishlist
 */
export const addToWishlist = async (userId, productId) => {
  try {
    const wishlistRef = doc(db, "wishlists", userId);
    
    await setDoc(wishlistRef, {
      items: arrayUnion(productId),
      updatedAt: serverTimestamp()
    }, { merge: true });

    return {
      success: true,
      message: "Added to wishlist!"
    };
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    return {
      success: false,
      message: "Failed to add to wishlist.",
      error: error.message
    };
  }
};

/**
 * Remove from wishlist
 */
export const removeFromWishlist = async (userId, productId) => {
  try {
    const wishlistRef = doc(db, "wishlists", userId);
    
    await updateDoc(wishlistRef, {
      items: arrayRemove(productId),
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Removed from wishlist!"
    };
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    return {
      success: false,
      message: "Failed to remove from wishlist.",
      error: error.message
    };
  }
};

// ====================================
// REVIEWS MANAGEMENT
// ====================================

/**
 * Add product review
 */
export const addReview = async (userId, userName, productId, productName, productImage, rating, reviewText) => {
  try {
    const reviewId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const review = {
      id: reviewId,
      userId: userId,
      userName: userName,
      productId: productId,
      productName: productName,
      productImage: productImage,
      rating: rating,
      review: reviewText,
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "reviews", reviewId), review);

    return {
      success: true,
      message: "Review submitted successfully!"
    };
  } catch (error) {
    console.error("Error adding review:", error);
    return {
      success: false,
      message: "Failed to submit review.",
      error: error.message
    };
  }
};

/**
 * Get product reviews
 */
export const getProductReviews = async (productId) => {
  try {
    const q = query(
      collection(db, "reviews"),
      where("productId", "==", productId),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const reviews = [];
    
    querySnapshot.forEach((doc) => {
      reviews.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return reviews;
  } catch (error) {
    console.error("Error getting reviews:", error);
    return [];
  }
};

/**
 * Get user's review for a product
 */
export const getUserProductReview = async (userId, productId) => {
  try {
    const q = query(
      collection(db, "reviews"),
      where("userId", "==", userId),
      where("productId", "==", productId)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error getting user review:", error);
    return null;
  }
};

/**
 * Update review
 */
export const updateReview = async (reviewId, rating, reviewText) => {
  try {
    await updateDoc(doc(db, "reviews", reviewId), {
      rating: rating,
      review: reviewText,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      message: "Review updated successfully!"
    };
  } catch (error) {
    console.error("Error updating review:", error);
    return {
      success: false,
      message: "Failed to update review.",
      error: error.message
    };
  }
};