import { useState, useRef, useEffect } from "react";

// ─── DKMerch Brand Colors ───
const PINK = "#fc1268";
const PURPLE = "#9c27b0";

const BOT_AVATAR = (
  <div style={{
    width: 32, height: 32, borderRadius: "50%",
    background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, flexShrink: 0, boxShadow: "0 2px 8px rgba(252,18,104,0.35)"
  }}>🎀</div>
);

// ─── Estimated delivery helper ───
const getEstimatedDelivery = () => {
  const addBusinessDays = (date, days) => {
    let d = new Date(date);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return d;
  };
  const today   = new Date();
  const earliest = addBusinessDays(today, 2);
  const latest   = addBusinessDays(today, 4);
  const fmt = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  return `${fmt(earliest)} – ${fmt(latest)}`;
};

// ─── All Q&A Tree ───
const MAIN_MENU = [
  { id: "orders", label: "📦 My Orders", icon: "📦" },
  { id: "preorders", label: "⏰ Pre-Orders", icon: "⏰" },
  { id: "payments", label: "💳 Payments", icon: "💳" },
  { id: "promos", label: "🔥 Promos & Discounts", icon: "🔥" },
  { id: "delivery", label: "🛵 Delivery & Tracking", icon: "🛵" },
  { id: "refunds", label: "↩️ Refunds", icon: "↩️" },
  { id: "products", label: "🛍️ Products & Collections", icon: "🛍️" },
];

const QA = {
  orders: {
    question: "What would you like to know about orders?",
    options: [
      {
        label: "How do I track my order?",
        answer: `You can track your order by going to the **Track Order** page from the navigation bar, or by visiting your **My Orders** page after logging in.\n\nYou'll need your Order ID to track it. Once your rider is out for delivery, you can see their live location on the map! 📍`
      },
      {
        label: "What are the order statuses?",
        answer: `Here are the order statuses in DKMerch:\n\n• **Pending** – Order placed, waiting for admin confirmation\n• **Confirmed** – Admin approved your order, rider will be assigned\n• **Shipped** – Rider picked up your order from the store\n• **Out for Delivery** – Rider is on the way to you\n• **Completed** – Order delivered successfully\n• **Cancelled** – Order was cancelled`
      },
      {
        label: "How do I cancel my order?",
        answer: `Order cancellation is handled by our admin team. If you need to cancel:\n\n1. Go to **My Orders** page\n2. Find your order\n3. Contact support at **support@dkmerch.com** with your Order ID\n\nNote: Orders that are already **Out for Delivery** cannot be cancelled.`
      },
      {
        label: "I didn't receive an email confirmation.",
        answer: `Order confirmation emails are sent automatically once admin confirms your order. Please check:\n\n• Your **spam/junk** folder\n• The email address you used to register\n\nIf you still can't find it, you can view your order status directly on the **My Orders** page or **Track Order** page.`
      },
    ]
  },
  preorders: {
    question: "What would you like to know about pre-orders?",
    options: [
      {
        label: "How does pre-ordering work?",
        answer: `Pre-orders let you reserve upcoming K-Pop merchandise before they're officially released! 🌟\n\nHere's how it works:\n1. Go to the **Pre-Order** page\n2. Click **Pre-Order** on any item with a release date\n3. You'll get an **email notification** when the item is available\n4. Once notified, go to **My Pre-Orders** → Available tab and add it to your cart\n5. Complete your purchase before the stock runs out!`
      },
      {
        label: "When will my pre-order be available?",
        answer: `Your pre-ordered item will become available on its scheduled **release date and time** (Philippine Time, PHT).\n\nYou'll automatically receive an **email notification** the moment it's released.\n\nYou can also check your **My Pre-Orders** page to see the release date and current status of each item.`
      },
      {
        label: "Can I cancel a pre-order?",
        answer: `Yes! You can cancel a pre-order anytime before it becomes available.\n\nJust go to **My Pre-Orders** → find the item → click **Cancel Pre-Order**.\n\nOnce an item is marked as **Available**, you'll need to decide quickly — add it to cart or it may sell out!`
      },
      {
        label: "I was notified but the item isn't in my cart.",
        answer: `When your pre-order becomes available, you'll receive an email with a link to **My Pre-Orders → Available tab**.\n\nFrom there:\n1. Click **Add to Cart** on the available item\n2. Proceed to checkout as normal\n\nThe item won't be automatically added to your cart — you need to do it manually after the notification.`
      },
    ]
  },
  payments: {
    question: "What would you like to know about payments?",
    options: [
      {
        label: "What payment methods are accepted?",
        answer: `DKMerch accepts the following payment methods:\n\n• **GCash** – via PayMongo secure checkout\n• **Maya (PayMaya)** – via PayMongo secure checkout\n• **Cash on Delivery (COD)** – pay when your order arrives\n\nOnline payments (GCash/Maya) are processed securely through **PayMongo**.`
      },
      {
        label: "Is online payment safe?",
        answer: `Yes! All online payments are processed through **PayMongo**, a PCI-DSS compliant payment gateway used by thousands of businesses in the Philippines.\n\nYour payment details are never stored on our servers. 🔒`
      },
      {
        label: "What happens after I pay online?",
        answer: `After completing your GCash or Maya payment:\n\n1. You'll be redirected to the **Order Success** page\n2. Your payment is automatically verified\n3. Your order status updates to **Pending** (awaiting admin confirmation)\n4. Admin will review and confirm your order\n5. You'll receive an email once confirmed!`
      },
      {
        label: "My payment was deducted but order didn't go through.",
        answer: `Don't worry! Here's what to do:\n\n1. Check your **My Orders** page first — the order may have been created\n2. Check your email for any order confirmation\n3. If the payment was deducted but no order exists, contact us at **support@dkmerch.com** with:\n   - Your email address\n   - Transaction reference number\n   - Screenshot of the payment\n\nWe'll resolve it as soon as possible!`
      },
    ]
  },
  promos: {
    question: "What would you like to know about promos?",
    options: [
      {
        label: "How do I use a promo code?",
        answer: `Using a promo code is easy!\n\n1. Add items to your cart\n2. Go to **Checkout**\n3. Enter your promo code in the **Promo Code** field\n4. Click Apply — your discount will be shown instantly\n5. Complete your order with the discounted price ✅\n\nPromo codes are case-insensitive (no need to worry about caps!)`
      },
      {
        label: "Why isn't my promo code working?",
        answer: `Your promo code might not work because:\n\n• **Expired** – The promo has already ended\n• **Not yet active** – The promo start date hasn't come yet\n• **Usage limit reached** – The promo has hit its maximum number of uses\n• **Minimum order not met** – Some promos require a minimum order amount\n• **Inactive** – The promo was deactivated\n\nDouble-check the code spelling and try again. If issues persist, contact support.`
      },
      {
        label: "How do I know if there are active promos?",
        answer: `Active promos are announced via **email** to all registered DKMerch users! 📧\n\nMake sure you have an account and your email is correct to receive promo announcements.\n\nYou can also check our homepage or collections page — active promos may be displayed there.`
      },
      {
        label: "Can I use multiple promo codes?",
        answer: `Only **one promo code** can be used per order at DKMerch.\n\nMake sure to choose the promo that gives you the best discount for your order! All promo discounts are **percentage-based** with a maximum discount cap.`
      },
    ]
  },
  delivery: {
    question: "What would you like to know about delivery?",
    options: [
      {
        label: "How long does delivery take?",
        answer: `Orders are typically delivered within **2–4 business days** after your order is confirmed. 🛵\n\nEstimated delivery: **${getEstimatedDelivery()}**\n\nDelivery time may vary depending on:\n• Your distance from our store\n• Rider availability\n• Weather conditions\n\nYou'll receive real-time updates as your order progresses!`
      },
      {
        label: "How does delivery work?",
        answer: `DKMerch uses our own network of **DK Riders** for delivery! 🛵\n\nHere's the delivery flow:\n1. Admin confirms your order\n2. A rider requests to pick up your order\n3. Admin approves the rider's pickup\n4. Rider picks up your items\n5. Rider heads to your address\n6. You receive an **OTP code** via email when rider is on the way\n7. Give the OTP to the rider to confirm delivery ✅\n\nEstimated time: **2–4 business days** from order confirmation.`
      },
      {
        label: "How do I track my rider's location?",
        answer: `Once your order is **Out for Delivery**, you can track your rider in real-time!\n\n1. Go to **Track Order** page\n2. Enter your Order ID\n3. You'll see a live map with your rider's current location 📍\n\nThe map updates in real-time so you know exactly when to expect your order!`
      },
      {
        label: "What is the delivery OTP?",
        answer: `The delivery OTP (One-Time Password) is a **4-digit code** sent to your email when your rider is on the way.\n\nWhen the rider arrives at your address, they'll ask for this code to **confirm delivery**. This protects you — only you can confirm receipt of your order.\n\nCheck your email inbox (including spam folder) for the OTP!`
      },
      {
        label: "What are the delivery areas?",
        answer: `DKMerch currently delivers within areas served by our DK Riders network.\n\nDelivery fees are calculated based on the **distance** from our store to your address.\n\nFor specific delivery coverage questions, contact us at **support@dkmerch.com**.`
      },
    ]
  },
  refunds: {
    question: "What would you like to know about refunds?",
    options: [
      {
        label: "Can I request a refund?",
        answer: `Yes! DKMerch accepts refund requests for **damaged items** upon delivery.\n\nYou can only request a refund after your order status is **Completed/Delivered**.\n\nTo request:\n1. Go to **My Orders** → find your order\n2. Click **Request Refund**\n3. Upload a clear photo of the damaged item\n4. Enter your GCash or Maya account details for the refund\n5. Submit your request`
      },
      {
        label: "How long does refund processing take?",
        answer: `Once you submit a refund request, our admin team will review it.\n\nIf **approved**: The refund is processed to your GCash or Maya account. Allow **up to 24 hours** to receive it after approval.\n\nIf **rejected**: You'll receive an email explaining the reason, and you may resubmit with clearer evidence.`
      },
      {
        label: "What refund methods are available?",
        answer: `Refunds are sent back via:\n\n• **GCash**\n• **Maya (PayMaya)**\n\nYou'll need to provide your account name and number when requesting the refund. Make sure the details are correct to avoid delays! 💰`
      },
      {
        label: "My refund request was rejected. What can I do?",
        answer: `If your refund was rejected:\n\n1. Check the **reason** provided in the rejection email from admin\n2. You can **resubmit** a new refund request with:\n   - A clearer, more detailed photo of the damaged item\n   - Additional context if needed\n3. If you believe it was wrongly rejected, contact us at **support@dkmerch.com**`
      },
    ]
  },
  products: {
    question: "What would you like to know about products?",
    options: [
      {
        label: "Where can I browse all products?",
        answer: `You can browse all available K-Pop merchandise on the **Collections** page!\n\nThe Collections page shows:\n• All regular in-stock products\n• Pre-order items that have already been released\n\nYou can also use the **Search** feature (🔍) to find specific items or K-Pop groups.`
      },
      {
        label: "What is the difference between regular and pre-order items?",
        answer: `**Regular Items** 🛍️\n• Available now in stock\n• Can be added to cart and purchased immediately\n• Found in the **Collections** page\n\n**Pre-Order Items** ⏰\n• Not yet released — have a future release date\n• You can pre-order to reserve your spot\n• Found in the **Pre-Order** page\n• Once released, you'll be notified to add to cart`
      },
      {
        label: "What K-Pop groups are available?",
        answer: `DKMerch carries merchandise for various K-Pop groups! 🎀\n\nThe available groups and items change regularly as new merchandise is added.\n\nVisit the **Collections** page and use the search or filter options to find your favorite K-Pop group's merch! New items are announced via email to all registered users.`
      },
      {
        label: "Are sale items available?",
        answer: `Yes! DKMerch occasionally puts items on sale with discounted prices. 🔖\n\nSale items are marked with their original price and discounted price on the product card.\n\nYou can browse sale items on the **Collections** page. Keep an eye out — sale items sell fast!`
      },
    ]
  },
};

// ─── Message Types ───
export default function DKMerchChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && !hasGreeted) {
      setHasGreeted(true);
      setTimeout(() => {
        setMessages([
          {
            from: "bot",
            text: "Hi there! 👋 Welcome to **DKMerch Support**!\n\nI'm your K-Pop Paradise assistant. How can I help you today?",
            options: MAIN_MENU,
            isMenu: true,
          }
        ]);
      }, 300);
    }
  }, [open, hasGreeted]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const t = setTimeout(() => setShowPulse(false), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleOption = (option) => {
    if (option.id) {
      setMessages(prev => [
        ...prev,
        { from: "user", text: option.label },
        {
          from: "bot",
          text: QA[option.id].question,
          options: QA[option.id].options,
          categoryId: option.id,
        }
      ]);
    } else if (option.answer) {
      setMessages(prev => [
        ...prev,
        { from: "user", text: option.label },
        {
          from: "bot",
          text: option.answer,
          showBack: true,
        }
      ]);
    }
  };

  const handleBack = () => {
    setMessages(prev => [
      ...prev,
      {
        from: "bot",
        text: "Is there anything else I can help you with? 😊",
        options: MAIN_MENU,
        isMenu: true,
      }
    ]);
  };

  const renderText = (text) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1
        ? <strong key={i}>{part}</strong>
        : part.split("\n").map((line, j, arr) => (
            <span key={j}>{line}{j < arr.length - 1 ? <br /> : null}</span>
          ))
    );
  };

  return (
    <>
      {/* ── Floating Button ── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}>
        {!open && showPulse && (
          <div style={{
            position: "absolute", inset: -6,
            borderRadius: "50%",
            background: `rgba(252,18,104,0.25)`,
            animation: "dkPulse 1.8s ease-out infinite",
          }} />
        )}
        <button
          onClick={() => {
            const willOpen = !open;
            setOpen(willOpen);
            if (willOpen) {
              document.body.style.overflow = 'hidden';
            } else {
              document.body.style.overflow = '';
              setMessages([]);
              setHasGreeted(false);
            }
          }}
          style={{
            width: 56, height: 56, borderRadius: "50%",
            background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 4px 20px rgba(252,18,104,0.45)",
            transition: "transform 0.2s, box-shadow 0.2s",
            position: "relative",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = "0 6px 28px rgba(252,18,104,0.6)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(252,18,104,0.45)";
          }}
          title="DKMerch Support"
        >
          {open ? "✕" : "💬"}
        </button>
      </div>

      {/* ── Chat Window ── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 92, right: 24, zIndex: 9998,
          width: 360, maxWidth: "calc(100vw - 48px)",
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 12px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(252,18,104,0.12)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "dkSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
          maxHeight: "70vh",
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
            padding: "16px 20px",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, border: "2px solid rgba(255,255,255,0.4)",
            }}>🎀</div>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>
                DKMerch Support
              </div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                Online now
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 14px",
            display: "flex", flexDirection: "column", gap: 12,
            background: "#f9f6fb",
          }}>
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.from === "bot" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    {BOT_AVATAR}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        background: "#fff",
                        borderRadius: "4px 16px 16px 16px",
                        padding: "10px 14px",
                        fontSize: 13.5, lineHeight: 1.6, color: "#1a1a1a",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                        maxWidth: "90%",
                      }}>
                        {renderText(msg.text)}
                      </div>

                      {msg.options && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                          {msg.options.map((opt, j) => (
                            <button
                              key={j}
                              onClick={() => handleOption(opt)}
                              style={{
                                background: "#fff",
                                border: `1.5px solid #e9d5f5`,
                                borderRadius: 10,
                                padding: "9px 14px",
                                fontSize: 13, color: "#5b0f7a",
                                cursor: "pointer", textAlign: "left",
                                fontWeight: 600,
                                transition: "all 0.15s",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = `linear-gradient(135deg, #fdf2f8, #f5f3ff)`;
                                e.currentTarget.style.borderColor = PINK;
                                e.currentTarget.style.color = PINK;
                                e.currentTarget.style.transform = "translateX(3px)";
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = "#fff";
                                e.currentTarget.style.borderColor = "#e9d5f5";
                                e.currentTarget.style.color = "#5b0f7a";
                                e.currentTarget.style.transform = "translateX(0)";
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.showBack && (
                        <button
                          onClick={handleBack}
                          style={{
                            marginTop: 8,
                            background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
                            border: "none", borderRadius: 10,
                            padding: "9px 16px",
                            fontSize: 12.5, color: "#fff",
                            cursor: "pointer", fontWeight: 700,
                            display: "flex", alignItems: "center", gap: 6,
                            boxShadow: "0 2px 8px rgba(252,18,104,0.3)",
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                        >
                          ← Back to Main Menu
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {msg.from === "user" && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{
                      background: `linear-gradient(135deg, ${PINK}, ${PURPLE})`,
                      borderRadius: "16px 4px 16px 16px",
                      padding: "10px 14px",
                      fontSize: 13.5, color: "#fff",
                      maxWidth: "78%", lineHeight: 1.5,
                      fontWeight: 500,
                      boxShadow: "0 2px 8px rgba(252,18,104,0.25)",
                    }}>
                      {msg.text}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 14px",
            background: "#fff",
            borderTop: "1px solid #f0e6f8",
            textAlign: "center",
            fontSize: 11, color: "#bbb",
          }}>
            🎀 DKMerch K-Pop Paradise · Automated Support
          </div>
        </div>
      )}

      <style>{`
        @keyframes dkPulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes dkSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}