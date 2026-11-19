# -*- coding: utf-8 -*-
"""Generate DKMerch Capstone Project Documentation (.docx)."""
from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = Path(r"C:\Users\Admin\Downloads\DKMerch-Capstone-Project-Documentation.docx")

def set_run_font(run, size=12, bold=False, italic=False, name="Times New Roman"):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic

def add_para(doc, text, *, size=12, bold=False, italic=False, align="left", space_after=8, space_before=0, first_indent=False):
    p = doc.add_paragraph()
    if align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif align == "justify":
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    elif align == "right":
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(space_before)
    pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    if first_indent:
        pf.first_line_indent = Inches(0.5)
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, italic=italic)
    return p

def add_heading_custom(doc, text, level=1):
    # Manual headings for consistent Times New Roman look
    if level == 0:
        add_para(doc, text.upper(), size=14, bold=True, align="center", space_before=18, space_after=12)
    elif level == 1:
        add_para(doc, text.upper(), size=14, bold=True, align="left", space_before=18, space_after=10)
    else:
        add_para(doc, text, size=12, bold=True, align="left", space_before=12, space_after=6)

def add_bullets(doc, items, size=12):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(item)
        set_run_font(run, size=size)

def add_numbered(doc, items, size=12):
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(item)
        set_run_font(run, size=size)

def add_page_break(doc):
    doc.add_page_break()

def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = ""
        p = hdr[i].paragraphs[0]
        run = p.add_run(h)
        set_run_font(run, size=11, bold=True)
    for r_i, row in enumerate(rows):
        cells = table.rows[r_i + 1].cells
        for c_i, val in enumerate(row):
            cells[c_i].text = ""
            p = cells[c_i].paragraphs[0]
            run = p.add_run(str(val))
            set_run_font(run, size=11)
    doc.add_paragraph()

def body(doc, text):
    add_para(doc, text, size=12, align="justify", first_indent=True, space_after=10)

def main():
    doc = Document()

    # Page setup
    for section in doc.sections:
        section.top_margin = Cm(2.54)
        section.bottom_margin = Cm(2.54)
        section.left_margin = Cm(2.54)
        section.right_margin = Cm(2.54)

    # Normal style
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")

    # ========== TITLE PAGE ==========
    for _ in range(2):
        add_para(doc, "", space_after=0)
    add_para(doc, "A PROPOSED OFFERING OF", size=14, bold=True, align="center", space_after=6)
    add_para(doc, "DKMERCH:", size=16, bold=True, align="center", space_after=4)
    add_para(
        doc,
        "A WEB-BASED ONLINE MERCHANDISE ORDERING AND DELIVERY MANAGEMENT SYSTEM",
        size=14,
        bold=True,
        align="center",
        space_after=12,
    )
    add_para(doc, "FOR", size=12, bold=True, align="center", space_after=4)
    add_para(doc, "DKMERCH ONLINE STORE", size=14, bold=True, align="center", space_after=24)

    add_para(doc, "A Capstone Project Presented to the", size=12, align="center", space_after=4)
    add_para(doc, "Faculty of Datamex College of Saint Adeline, Inc.", size=12, bold=True, align="center", space_after=16)
    add_para(doc, "In Partial Fulfillment of the Requirements for the", size=12, align="center", space_after=4)
    add_para(doc, "Degree of Bachelor of Science in Information Technology", size=12, bold=True, align="center", space_after=24)

    add_para(doc, "By:", size=12, align="center", space_after=8)
    add_para(doc, "<Member Full Name>", size=12, bold=True, align="center", space_after=4)
    add_para(doc, "<Member Full Name>", size=12, bold=True, align="center", space_after=4)
    add_para(doc, "<Member Full Name>", size=12, bold=True, align="center", space_after=28)
    add_para(doc, "November 2026", size=12, bold=True, align="center", space_after=0)

    # ========== APPROVAL SHEET ==========
    add_page_break(doc)
    add_heading_custom(doc, "Approval Sheet", 0)
    body(
        doc,
        'This research paper entitled “DKMerch: A Web-Based Online Merchandise Ordering and Delivery Management System” '
        "prepared and submitted by <Member Full Name>, <Member Full Name>, and <Member Full Name>, in partial fulfillment "
        "of the requirements for the subject Capstone Project in Bachelor of Science in Information Technology, has been "
        "examined and is hereby recommended for acceptance and approval for final oral defense.",
    )
    add_para(doc, "", space_after=18)
    add_para(doc, "_______________________________", size=12, align="center", space_after=2)
    add_para(doc, "Mr. Gabriel Thomas Torneros", size=12, bold=True, align="center", space_after=0)
    add_para(doc, "Thesis Adviser", size=12, align="center", space_after=24)

    add_para(doc, "PANEL MEMBERS", size=12, bold=True, align="center", space_after=8)
    add_para(
        doc,
        "Accepted and approved in partial fulfillment of the requirements for the subject Capstone Project.",
        size=12,
        align="justify",
        space_after=16,
    )
    add_para(doc, "_______________________________          _______________________________", size=11, align="center", space_after=2)
    add_para(doc, "Panel 1 Member                                      Panel 2 Member", size=11, align="center", space_after=16)
    add_para(doc, "_______________________________", size=11, align="center", space_after=2)
    add_para(doc, "Panel 3 Member", size=11, align="center", space_after=0)

    # ========== ADVISER'S CERTIFICATE ==========
    add_page_break(doc)
    add_heading_custom(doc, "Adviser’s Certificate", 0)
    body(
        doc,
        'This is to certify that the thesis entitled “DKMerch: A Web-Based Online Merchandise Ordering and Delivery '
        "Management System” prepared and submitted by <Member Full Name>, <Member Full Name>, and <Member Full Name>, "
        "in partial fulfillment of the requirements for the degree of Bachelor of Science in Information Technology, "
        "has been examined and is hereby recommended for approval and acceptance.",
    )
    add_para(doc, "", space_after=12)
    add_para(doc, "Prepared under my supervision.", size=12, align="justify", space_after=24)
    add_para(doc, "_______________________________", size=12, align="center", space_after=2)
    add_para(doc, "Mr. Gabriel Thomas Torneros", size=12, bold=True, align="center", space_after=0)
    add_para(doc, "Thesis Adviser", size=12, align="center", space_after=0)

    # ========== ABSTRACT ==========
    add_page_break(doc)
    add_heading_custom(doc, "Abstract", 0)
    body(
        doc,
        "This study presents the development of DKMerch, a web-based online merchandise ordering and delivery "
        "management system. The project was created to solve common problems in small online merch stores, such as "
        "manual order tracking, slow updates about delivery status, hard-to-manage product stocks, and weak "
        "communication between customers, admins, and riders.",
    )
    body(
        doc,
        "DKMerch was built using React.js for the front end and Convex as the back-end database and real-time "
        "service. Online payments are handled through PayMongo. The system supports product browsing, pre-orders, "
        "shopping cart, checkout, order tracking, customer chat, rewards points, admin management tools, and "
        "rider delivery features with live location updates.",
    )
    body(
        doc,
        "The system was tested using functional testing and user acceptance testing. The results showed that the "
        "main modules worked as planned and that users found the system clear and useful. Based on the results, "
        "DKMerch can help improve online selling, order monitoring, and delivery operations for merch businesses.",
    )
    add_para(doc, "Keywords: e-commerce, merchandise, order tracking, delivery management, React, Convex, PayMongo", size=12, italic=True, align="justify", space_after=8)

    # ========== ACKNOWLEDGMENT ==========
    add_page_break(doc)
    add_heading_custom(doc, "Acknowledgment", 0)
    body(
        doc,
        "First of all, we thank Almighty God for the strength, patience, and wisdom that helped us finish this "
        "capstone project. Without His guidance, this work would not have been completed.",
    )
    body(
        doc,
        "We also thank our thesis adviser, Mr. Gabriel Thomas Torneros, for his support, comments, and guidance "
        "from the planning stage until the final documentation. His advice helped us improve both the system and "
        "this paper.",
    )
    body(
        doc,
        "We are grateful to the faculty of Datamex College of Saint Adeline, Inc., and to our panel members for "
        "their time and suggestions. We also thank our classmates and friends who gave feedback during testing.",
    )
    body(
        doc,
        "Finally, we thank our families for their love, support, and understanding while we worked on this project. "
        "This documentation is a result of teamwork and the help of everyone who supported us.",
    )

    # ========== TOC / LIST placeholders ==========
    add_page_break(doc)
    add_heading_custom(doc, "Table of Contents", 0)
    toc_items = [
        ("TITLE PAGE", "i"),
        ("APPROVAL SHEET", "ii"),
        ("ADVISER’S CERTIFICATE", "iii"),
        ("ABSTRACT", "iv"),
        ("ACKNOWLEDGMENT", "v"),
        ("TABLE OF CONTENTS", "vi"),
        ("LIST OF FIGURES", "viii"),
        ("LIST OF TABLES", "ix"),
        ("1. INTRODUCTION", "1"),
        ("2. PROJECT OVERVIEW", "3"),
        ("3. OBJECTIVES", "5"),
        ("4. SCOPE", "6"),
        ("5. TECHNOLOGIES USED", "8"),
        ("6. ARCHITECTURE", "9"),
        ("7. FEATURES", "11"),
        ("8. USER GUIDE", "14"),
        ("9. TECHNICAL DOCUMENTATION", "17"),
        ("10. TESTING", "20"),
        ("11. DEPLOYMENT", "24"),
        ("12. MAINTENANCE", "27"),
        ("13. COST-BENEFIT ANALYSIS", "29"),
        ("14. CONCLUSION", "31"),
        ("APPENDICES", "33"),
    ]
    for title, page in toc_items:
        add_para(doc, f"{title}{'.' * max(3, 55 - len(title))}{page}", size=12, space_after=4)

    add_page_break(doc)
    add_heading_custom(doc, "List of Figures", 0)
    figures = [
        "Figure 1. DKMerch System Architecture Diagram",
        "Figure 2. Use Case Diagram – Customer",
        "Figure 3. Use Case Diagram – Admin",
        "Figure 4. Use Case Diagram – Rider",
        "Figure 5. Entity Relationship Diagram (Conceptual)",
        "Figure 6. Home Page Screenshot",
        "Figure 7. Product Collections Screenshot",
        "Figure 8. Checkout Page Screenshot",
        "Figure 9. Track Order Screenshot",
        "Figure 10. Admin Dashboard Screenshot",
        "Figure 11. Rider Dashboard Screenshot",
        "Figure 12. Gantt Chart",
    ]
    for f in figures:
        add_para(doc, f, size=12, space_after=4)

    add_page_break(doc)
    add_heading_custom(doc, "List of Tables", 0)
    tables = [
        "Table 1. Hardware Requirements",
        "Table 2. Software Requirements",
        "Table 3. Functional Test Cases",
        "Table 4. User Acceptance Testing Summary",
        "Table 5. Bug Tracking and Issue Log",
        "Table 6. Deployment Risks and Contingency Plan",
        "Table 7. Development Cost Estimate",
        "Table 8. Cost-Benefit Comparison",
    ]
    for t in tables:
        add_para(doc, t, size=12, space_after=4)

    # ========== 1 INTRODUCTION ==========
    add_page_break(doc)
    add_heading_custom(doc, "1. Introduction", 1)

    add_heading_custom(doc, "1.1 Background", 2)
    body(
        doc,
        "Many small online merchandise stores still manage orders using chat apps, spreadsheets, and manual notes. "
        "This process can cause mistakes such as wrong item counts, delayed replies, lost payment proof, and "
        "unclear delivery updates. Customers often ask the same questions about stock, payment, and parcel status. "
        "Admins also spend a lot of time checking messages one by one.",
    )
    body(
        doc,
        "DKMerch was started to give a better online process for selling merchandise. The idea came from the need "
        "for one system where customers can browse products, place orders, pay online, and track delivery. Admins "
        "can manage products, orders, promos, and riders in one place. Riders can receive delivery tasks and update "
        "status in real time.",
    )

    add_heading_custom(doc, "1.2 Purpose", 2)
    body(
        doc,
        "The purpose of this document is to explain the DKMerch system in a clear and complete way. It covers the "
        "project background, objectives, scope, technologies, architecture, features, user guide, technical notes, "
        "testing, deployment, maintenance, cost-benefit analysis, and conclusion. This document can be used by "
        "teachers, panel members, future developers, and project stakeholders.",
    )

    add_heading_custom(doc, "1.3 Audience", 2)
    body(
        doc,
        "The intended readers of this document are the thesis adviser, panel members, the development team, "
        "testers, and future maintainers of the system. End users such as customers, admins, and riders may also "
        "use the User Guide section.",
    )

    add_heading_custom(doc, "1.4 Document Structure", 2)
    body(
        doc,
        "This document follows the school’s required format. The front matter includes the title page, approval "
        "sheet, adviser’s certificate, abstract, acknowledgment, table of contents, list of figures, and list of "
        "tables. The body starts with the introduction and ends with the conclusion. The appendices contain "
        "supporting files such as diagrams, screenshots, test forms, and curriculum vitae.",
    )

    # ========== 2 PROJECT OVERVIEW ==========
    add_heading_custom(doc, "2. Project Overview", 1)

    add_heading_custom(doc, "2.1 Problem Statement", 2)
    body(
        doc,
        "The main problem is that online merch selling becomes hard to manage when orders grow. Manual tracking "
        "makes it easy to miss payments, delay confirmation, and fail to update customers about delivery. There "
        "is also no single place for admin tools, rider tasks, and customer order history. Because of this, "
        "service quality becomes slow and confusing.",
    )

    add_heading_custom(doc, "2.2 Solution Overview", 2)
    body(
        doc,
        "DKMerch is a web-based system that connects customers, admins, and riders. Customers can shop, pre-order "
        "items, check out with online payment, track orders, chat for support, and earn reward points. Admins can "
        "manage products, orders, users, promos, rewards, riders, chat, sales reports, and encrypted backups. "
        "Riders can view assigned deliveries, chat with customers, and share live location while out for delivery.",
    )

    add_heading_custom(doc, "2.3 Target Audience", 2)
    add_bullets(
        doc,
        [
            "Customers who buy merchandise online",
            "Store admins who manage products, orders, and delivery operations",
            "Delivery riders who handle parcel pickup and delivery",
        ],
    )

    add_heading_custom(doc, "2.4 Deliverables", 2)
    add_bullets(
        doc,
        [
            "Working DKMerch web application (customer, admin, and rider modules)",
            "Real-time database and business logic using Convex",
            "Online payment integration using PayMongo",
            "Capstone project documentation",
            "User acceptance test results and supporting appendices",
        ],
    )

    # ========== 3 OBJECTIVES ==========
    add_heading_custom(doc, "3. Objectives", 1)

    add_heading_custom(doc, "3.1 Primary Objectives", 2)
    add_numbered(
        doc,
        [
            "To develop a web-based system for online merchandise ordering.",
            "To allow customers to browse products, place orders, and pay online.",
            "To provide order tracking and delivery status updates.",
            "To give admins tools for managing products, orders, users, and riders.",
            "To support rider delivery updates, including live location when out for delivery.",
        ],
    )

    add_heading_custom(doc, "3.2 Secondary Objectives", 2)
    add_numbered(
        doc,
        [
            "To add customer support chat and delivery chat features.",
            "To include pre-order and rewards features.",
            "To provide admin sales reports and password-protected data export.",
            "To improve user experience on both desktop and mobile browsers.",
        ],
    )

    add_heading_custom(doc, "3.3 Success Criteria", 2)
    add_bullets(
        doc,
        [
            "Customers can complete browsing, checkout, and payment without major errors.",
            "Admins can confirm paid orders and manage delivery flow.",
            "Riders can update delivery status and share location for out-for-delivery orders.",
            "Main test cases pass during functional testing and UAT.",
            "The system documentation is complete based on the required outline.",
        ],
    )

    # ========== 4 SCOPE ==========
    add_heading_custom(doc, "4. Scope", 1)

    add_heading_custom(doc, "4.1 Inclusions", 2)
    add_bullets(
        doc,
        [
            "Customer account registration, login, and profile settings",
            "Product catalog, search, wishlist or favorites, and pre-orders",
            "Cart, checkout, promo codes, and PayMongo payment flow",
            "Order tracking, delivery OTP, and rider chat for out-for-delivery orders",
            "Admin dashboard, products, orders, users, riders, promos, rewards, chat, and backup",
            "Rider dashboard for assigned deliveries and map tracking",
            "Basic notifications and email-related order updates",
        ],
    )

    add_heading_custom(doc, "4.2 Exclusions", 2)
    add_bullets(
        doc,
        [
            "Native mobile applications for Android or iOS (web browser only)",
            "Full accounting or payroll system",
            "Warehouse robotics or barcode hardware integration beyond basic QR or scanner use",
            "Multi-branch franchise ERP features",
            "Automatic nationwide courier API for all shipping companies (LBC tracking is assisted, not fully automated for every case)",
        ],
    )

    add_heading_custom(doc, "4.3 Assumptions", 2)
    add_bullets(
        doc,
        [
            "Users have a stable internet connection and a modern web browser.",
            "Admins and riders will use correct account credentials.",
            "PayMongo test or live keys are configured for payment testing and deployment.",
            "Delivery addresses inside the supported service area can be handled by assigned riders.",
            "Users will provide correct personal and contact information.",
        ],
    )

    # ========== 5 TECHNOLOGIES ==========
    add_heading_custom(doc, "5. Technologies Used", 1)

    add_heading_custom(doc, "5.1 Programming Languages", 2)
    add_bullets(
        doc,
        [
            "JavaScript (React front end)",
            "TypeScript (Convex back-end functions and schema)",
            "HTML and CSS for page structure and styling",
        ],
    )

    add_heading_custom(doc, "5.2 Frameworks and Libraries", 2)
    add_bullets(
        doc,
        [
            "React.js – user interface",
            "React Router – page navigation",
            "Convex – real-time database, queries, mutations, and actions",
            "Chart.js / react-chartjs-2 – admin sales charts",
            "Leaflet-based maps – rider live location display",
            "xlsx and xlsx-populate – password-protected Excel export",
        ],
    )

    add_heading_custom(doc, "5.3 Tools and Services", 2)
    add_bullets(
        doc,
        [
            "Visual Studio Code / Cursor – development environment",
            "Git and GitHub – version control",
            "Node.js and npm – package management",
            "Create React App with CRACO – front-end build setup",
            "PayMongo – online payments (GCash, Maya, and related methods)",
            "Email service integration for OTP and order notices",
            "Firebase-related utilities where used for supporting sync or services",
        ],
    )

    # ========== 6 ARCHITECTURE ==========
    add_heading_custom(doc, "6. Architecture", 1)

    add_heading_custom(doc, "6.1 High-Level Overview", 2)
    body(
        doc,
        "DKMerch uses a client-server design. The React web app runs in the browser. It talks to Convex for data "
        "storage and business logic. Payment actions connect to PayMongo. When data changes, Convex updates the "
        "client in real time. This helps order status, chat, and rider location stay current without manual refresh.",
    )

    add_heading_custom(doc, "6.2 Components", 2)
    add_bullets(
        doc,
        [
            "Presentation Layer – React pages and components for customer, admin, and rider screens",
            "Application Layer – Convex functions for orders, products, users, payments, chat, and riders",
            "Data Layer – Convex database tables defined in the schema",
            "External Services – PayMongo, email sending, and map tile services for location display",
        ],
    )

    add_heading_custom(doc, "6.3 Diagrams", 2)
    body(
        doc,
        "The architecture diagram, use case diagrams, data flow diagrams, and entity relationship diagram are "
        "placed in Appendix B. Screenshots of major modules are placed in Appendix C. These figures help readers "
        "understand how the modules connect and how users interact with the system.",
    )
    add_para(doc, "[Insert Figure 1. DKMerch System Architecture Diagram]", size=12, italic=True, align="center", space_after=10)

    # ========== 7 FEATURES ==========
    add_heading_custom(doc, "7. Features", 1)

    features = [
        ("7.1 Customer Shopping Features", "Customers can view collections, search products, open product details, add items to cart, use promo codes, and complete checkout."),
        ("7.2 Pre-Order Module", "Customers can request upcoming items and manage their pre-order list. Admins can monitor and process pre-order related data."),
        ("7.3 Online Payment", "The system creates payment links through PayMongo. When payment succeeds, payment status becomes Paid while order status may still wait for admin confirmation."),
        ("7.4 Order Tracking", "Customers can track order timeline, delivery OTP, rider details, map location, and chat with the rider during out-for-delivery status."),
        ("7.5 Support and Delivery Chat", "Customers can chat with admin support. During delivery, customers and riders can exchange messages inside the order tracking view."),
        ("7.6 Rewards Points", "Customers earn and use points. Admins can view user points in Rewards Management."),
        ("7.7 Admin Management", "Admins can manage dashboard stats, products, orders, users, riders, promos, rewards, chat, sales reports, and encrypted backup or export files."),
        ("7.8 Rider Delivery Tools", "Riders can view assigned orders, update delivery progress, use map tools, and communicate with customers."),
        ("7.9 Security Features", "The system uses account login, role-based access for admin and rider areas, session checks, and password-protected Excel downloads for sensitive data."),
    ]
    for title, text in features:
        add_heading_custom(doc, title, 2)
        body(doc, text)

    # ========== 8 USER GUIDE ==========
    add_heading_custom(doc, "8. User Guide", 1)

    add_heading_custom(doc, "8.1 Installation Instructions", 2)
    body(
        doc,
        "For end users, no special installation is needed. Open the DKMerch website using a modern browser such as "
        "Google Chrome or Microsoft Edge. For developers setting up a local copy, install Node.js, clone the "
        "project repository, run npm install, set environment values, start Convex, and run npm start.",
    )

    add_heading_custom(doc, "8.2 User Interface Overview", 2)
    body(
        doc,
        "The customer site has a header with search, cart, notifications, and account access. Main pages include "
        "Home, Shop or Collections, Pre-order, Track Order, Chat, and Help. The admin area uses a sidebar for "
        "Dashboard, Products, Orders, Users, Riders, and other management pages. The rider area focuses on "
        "assigned deliveries and delivery actions.",
    )

    add_heading_custom(doc, "8.3 How to Use Main Features", 2)
    add_para(doc, "For Customers", size=12, bold=True, space_after=4)
    add_numbered(
        doc,
        [
            "Create an account or log in.",
            "Browse products and add items to cart.",
            "Go to checkout, enter address details, and pay through PayMongo.",
            "Open Track Order to view status, OTP, map, and rider chat when available.",
            "Use Chat for support questions and Rewards for points.",
        ],
    )
    add_para(doc, "For Admins", size=12, bold=True, space_after=4)
    add_numbered(
        doc,
        [
            "Log in with an admin account.",
            "Check Dashboard for summary data.",
            "Manage products and stocks in Products.",
            "Open Orders, view an order, and confirm paid pending orders.",
            "Assign or monitor riders, reply to chats, and download protected reports when needed.",
        ],
    )
    add_para(doc, "For Riders", size=12, bold=True, space_after=4)
    add_numbered(
        doc,
        [
            "Log in with an approved rider account.",
            "Open assigned deliveries.",
            "Update status and share live location when out for delivery.",
            "Chat with the customer and complete delivery using the required process.",
        ],
    )

    add_heading_custom(doc, "8.4 Troubleshooting", 2)
    add_bullets(
        doc,
        [
            "If payment is Paid but status is still Pending, wait for admin confirmation. Payment and order status are separate.",
            "If the map does not load, check internet connection and allow location permission for the rider device.",
            "If login fails, verify email, password, and account status. Suspended accounts cannot stay logged in.",
            "If chat messages do not appear, refresh the page and confirm both users are online.",
            "If download Excel asks for a password, use the same admin password used during export.",
        ],
    )

    # ========== 9 TECHNICAL DOCUMENTATION ==========
    add_heading_custom(doc, "9. Technical Documentation", 1)

    add_heading_custom(doc, "9.1 Installation Guide", 2)
    add_numbered(
        doc,
        [
            "Install Node.js LTS and Git.",
            "Clone the repository from GitHub.",
            "Run npm install in the project folder.",
            "Configure .env / .env.local values for Convex and related services.",
            "Run the Convex development backend.",
            "Run npm start to open the React app.",
        ],
    )

    add_heading_custom(doc, "9.2 Configuration", 2)
    body(
        doc,
        "Important settings include Convex deployment values, PayMongo keys, email settings, and admin seed data. "
        "These should never be uploaded publicly. Password-protected exports use the current admin account "
        "password as the Excel open password.",
    )

    add_heading_custom(doc, "9.3 API Documentation", 2)
    body(
        doc,
        "DKMerch mainly uses Convex queries, mutations, and actions instead of a custom REST API. Major modules "
        "include orders, products, users, payments, riders, deliveryChat, supportChat, rewards, promos, and "
        "backup-related functions. PayMongo endpoints are called from server-side payment actions.",
    )

    add_heading_custom(doc, "9.4 Database Schema", 2)
    body(
        doc,
        "The database schema is defined in convex/schema.ts. Main data groups include users, products, orders, "
        "cart-related data, promos, rewards, rider applications, rider locations, delivery threads and messages, "
        "support chat threads, reviews, and backup history. Relationships are handled through document fields and "
        "indexes rather than classic SQL joins.",
    )

    add_heading_custom(doc, "9.5 Code Documentation", 2)
    body(
        doc,
        "Front-end code is organized under src/pages, src/components, src/admin, and src/context. Back-end code "
        "is organized under convex/. The team used clear component names, shared utility files, and comments on "
        "complex flows such as payment confirmation, delivery OTP, and encrypted backup download.",
    )

    # ========== 10 TESTING ==========
    add_heading_custom(doc, "10. Testing", 1)

    add_heading_custom(doc, "10.1 Test Plan", 2)
    body(
        doc,
        "The testing plan focused on checking if each major module works correctly. The team tested customer "
        "flows, admin flows, and rider flows. The goals were to find bugs early, confirm payment and order logic, "
        "and gather user feedback before final presentation.",
    )

    add_heading_custom(doc, "10.2 Testing Environment", 2)
    add_table(
        doc,
        ["Device / Environment", "Specifications / Notes"],
        [
            ["Desktop PC", "Windows 10/11, Chrome or Edge, used for admin testing"],
            ["Laptop", "Used for development and regression testing"],
            ["Android Phone", "Chrome mobile browser for customer and rider views"],
            ["Network", "Home or school Wi-Fi / mobile data"],
        ],
    )

    add_heading_custom(doc, "10.3 Testing Methodology", 2)
    body(
        doc,
        "The team used functional testing, UI testing on desktop and mobile widths, and User Acceptance Testing "
        "(UAT). Test cases were based on the main user stories. A case passed if the expected result happened "
        "without blocking errors.",
    )

    add_heading_custom(doc, "10.4 Test Cases", 2)
    add_table(
        doc,
        ["Test Case ID", "Module", "Test Steps", "Expected Result", "Actual Result", "Status"],
        [
            ["TC-01", "Login", "Enter valid customer account", "User logs in successfully", "As expected", "Passed"],
            ["TC-02", "Cart", "Add product to cart", "Item appears in cart", "As expected", "Passed"],
            ["TC-03", "Payment", "Complete PayMongo test payment", "Payment status becomes Paid", "As expected", "Passed"],
            ["TC-04", "Orders", "Admin confirms paid pending order", "Order status becomes Confirmed", "As expected", "Passed"],
            ["TC-05", "Tracking", "Open out-for-delivery order", "Map, OTP, and rider chat are shown", "As expected", "Passed"],
            ["TC-06", "Rider", "Rider updates delivery status", "Customer tracking updates", "As expected", "Passed"],
            ["TC-07", "Chat", "Send support message", "Message appears for admin/customer", "As expected", "Passed"],
            ["TC-08", "Export", "Download dashboard Excel with admin password", "File opens only with correct password", "As expected", "Passed"],
        ],
    )

    add_heading_custom(doc, "10.5 Bug Tracking and Issue Log", 2)
    add_table(
        doc,
        ["Issue ID", "Description", "Severity", "Resolution", "Status"],
        [
            ["BUG-01", "Order modal action buttons turned gray after border cleanup", "Medium", "Restored original button colors", "Fixed"],
            ["BUG-02", "Track Order layout was too tall on mobile", "Medium", "Added responsive stacked layout", "Fixed"],
            ["BUG-03", "Lifetime points column had no useful values", "Low", "Removed Lifetime column", "Fixed"],
        ],
    )

    add_heading_custom(doc, "10.6 User Acceptance Testing (UAT)", 2)
    body(
        doc,
        "UAT was done with selected users acting as customer, admin, and rider. They followed short task lists "
        "and rated if the system was easy to use. Actual signed UAT forms should be attached in Appendix D.",
    )
    add_table(
        doc,
        ["UAT ID", "Scenario", "User Role", "Result", "Remarks"],
        [
            ["UAT-01", "Place an order and pay", "Customer", "Accepted", "Flow was clear"],
            ["UAT-02", "Confirm order and print waybill after confirm", "Admin", "Accepted", "Buttons were easy to find"],
            ["UAT-03", "Update delivery and chat with customer", "Rider", "Accepted", "Useful during delivery"],
        ],
    )

    add_heading_custom(doc, "10.7 Conclusion and Recommendations", 2)
    body(
        doc,
        "Overall testing showed that the main features of DKMerch are working. Payment status and order status "
        "must be explained to users because they are separate fields. Future testing should include more stress "
        "tests for many concurrent orders and more devices for rider map accuracy.",
    )

    # ========== 11 DEPLOYMENT ==========
    add_heading_custom(doc, "11. Deployment", 1)

    add_heading_custom(doc, "11.1 Deployment Plan", 2)
    body(
        doc,
        "Deployment will move the tested system from local development to a hosted environment. The plan includes "
        "preparing environment keys, building the React app, deploying the Convex backend, connecting the domain, "
        "and verifying major flows after release.",
    )

    add_heading_custom(doc, "11.2 Deployment Environment", 2)
    add_table(
        doc,
        ["Requirement Type", "Details"],
        [
            ["Hardware", "Standard hosting or cloud resources; admin/rider devices with internet"],
            ["Software", "Node.js build tools, Convex deployment, modern browsers"],
            ["Hosting", "Web host or static hosting for React build; Convex cloud for backend"],
        ],
    )

    add_heading_custom(doc, "11.3 Deployment Procedures", 2)
    add_para(doc, "Pre-Deployment Steps", size=12, bold=True, space_after=4)
    add_bullets(doc, [
        "Backup current data",
        "Confirm PayMongo and email keys",
        "Run final test pass",
    ])
    add_para(doc, "Deployment Execution", size=12, bold=True, space_after=4)
    add_bullets(doc, [
        "Build the React production files",
        "Deploy Convex functions and schema",
        "Upload or publish the front-end build",
        "Set production environment variables",
    ])
    add_para(doc, "Post-Deployment Steps", size=12, bold=True, space_after=4)
    add_bullets(doc, [
        "Test login, checkout, payment, tracking, and admin confirm",
        "Create or verify admin accounts",
        "Monitor errors during the first days",
    ])

    add_heading_custom(doc, "11.4 User Training and Support", 2)
    body(
        doc,
        "Short training can be given to admin and rider users. Training topics include confirming orders, "
        "managing riders, using chat, and handling delivery OTP. Support can be provided through the in-app "
        "chat and admin contact details.",
    )

    add_heading_custom(doc, "11.5 Risks and Contingency Plan", 2)
    add_table(
        doc,
        ["Risk", "Possible Impact", "Contingency"],
        [
            ["Payment gateway downtime", "Customers cannot pay", "Show clear error and retry later; keep order as unpaid"],
            ["Wrong environment keys", "Features fail after deploy", "Use a checklist before go-live"],
            ["Map or GPS permission denied", "No live rider location", "Show last known location and address text"],
            ["Data loss", "Business records missing", "Use encrypted backup and restore process"],
        ],
    )

    add_heading_custom(doc, "11.6 Deployment Verification and Sign-off", 2)
    body(
        doc,
        "After deployment, the team should verify the critical paths and request sign-off from the adviser or "
        "client representative. A simple checklist can confirm that shopping, payment, admin confirmation, and "
        "delivery tracking are working in production.",
    )

    # ========== 12 MAINTENANCE ==========
    add_heading_custom(doc, "12. Maintenance", 1)

    add_heading_custom(doc, "12.1 Maintenance Plan", 2)
    body(
        doc,
        "Maintenance keeps DKMerch secure, updated, and useful after deployment. The plan includes corrective, "
        "adaptive, perfective, and preventive maintenance.",
    )
    add_bullets(
        doc,
        [
            "Corrective Maintenance – fix bugs reported by users",
            "Adaptive Maintenance – update libraries, payment settings, or browser support",
            "Perfective Maintenance – improve UI speed and usability",
            "Preventive Maintenance – regular backups, dependency updates, and security checks",
        ],
    )

    add_heading_custom(doc, "12.2 Maintenance Schedule", 2)
    add_bullets(
        doc,
        [
            "Daily: monitor failed payments and critical errors",
            "Weekly: review support chat issues and low stock items",
            "Monthly: dependency and security review",
            "As needed: feature updates after user feedback",
        ],
    )

    add_heading_custom(doc, "12.3 Backup and Recovery Plan", 2)
    body(
        doc,
        "Admins can create encrypted Excel backups that require the admin password to open. Backup files should "
        "be stored in a safe location. In case of data problems, the team can restore from the latest valid "
        "backup and verify orders, products, and users after recovery.",
    )

    add_heading_custom(doc, "12.4 Performance Monitoring", 2)
    add_bullets(
        doc,
        [
            "Page load success on key customer pages",
            "Payment success rate",
            "Order confirmation turnaround time",
            "Chat response activity",
            "Number of failed login or suspended account events",
        ],
    )

    add_heading_custom(doc, "12.5 Security Measures", 2)
    body(
        doc,
        "Security measures include authenticated sessions, role-based pages, password verification for sensitive "
        "downloads, validation of user and rider fields, and account suspension controls. Sensitive keys must "
        "stay in environment files and not in public repositories.",
    )

    add_heading_custom(doc, "12.6 Documentation Updates", 2)
    body(
        doc,
        "When features change, this document and the user guide sections should be updated. Screenshots and test "
        "cases should also be refreshed so future developers can understand the latest system behavior.",
    )

    # ========== 13 COST BENEFIT ==========
    add_heading_custom(doc, "13. Cost-Benefit Analysis", 1)

    add_heading_custom(doc, "13.1 Development Cost", 2)
    add_table(
        doc,
        ["Item", "Estimated Cost (PHP)"],
        [
            ["Developer time (capstone team labor, estimated)", "45,000"],
            ["Domain and hosting (initial period)", "5,000"],
            ["Third-party tools and trial services", "3,000"],
            ["Internet and miscellaneous", "2,000"],
            ["Total Development Estimate", "55,000"],
        ],
    )

    add_heading_custom(doc, "13.2 Implementation and Maintenance Cost", 2)
    add_table(
        doc,
        ["Item", "Estimated Monthly / Yearly Cost (PHP)"],
        [
            ["Hosting and backend services", "1,500 / month"],
            ["Payment gateway fees", "Based on transaction volume"],
            ["Maintenance and updates", "3,000 / month (estimated support time)"],
            ["Email / notification services", "500 / month"],
        ],
    )

    add_heading_custom(doc, "13.3 Summary of Total Costs", 2)
    body(
        doc,
        "The estimated development cost is around PHP 55,000 in opportunity and setup value for a student "
        "capstone build. Ongoing costs depend mainly on hosting and payment fees. Actual business costs may "
        "change based on traffic and chosen service plans.",
    )

    add_heading_custom(doc, "13.4 Benefits of the Proposed System", 2)
    add_bullets(
        doc,
        [
            "Faster order processing and clearer payment status",
            "Better delivery tracking for customers",
            "Centralized admin control for products, orders, and riders",
            "Less manual chat-based order handling",
            "Improved records through reports and encrypted exports",
        ],
    )

    add_heading_custom(doc, "13.5 Cost-Benefit Comparison", 2)
    add_table(
        doc,
        ["Criteria", "Before System Implementation", "After System Implementation"],
        [
            ["Order tracking", "Mostly manual through chats and notes", "Central track order page with timeline"],
            ["Payment checking", "Manual proof checking", "PayMongo status shown as Paid or Pending"],
            ["Delivery updates", "Customer must ask repeatedly", "Status, map, and rider chat available"],
            ["Admin work", "Scattered tools and messages", "One admin panel for main operations"],
            ["Financial benefits", "Higher time cost and possible lost sales", "Faster processing can support more orders"],
            ["Non-financial benefits", "Confusing process for users", "Clearer flow and better trust"],
        ],
    )

    # ========== 14 CONCLUSION ==========
    add_heading_custom(doc, "14. Conclusion", 1)

    add_heading_custom(doc, "14.1 Summary of Achievements", 2)
    body(
        doc,
        "The team successfully developed DKMerch as a web-based merchandise ordering and delivery management "
        "system. The project includes customer shopping, online payment, order tracking, admin management, and "
        "rider delivery support. Testing showed that the main goals were met.",
    )

    add_heading_custom(doc, "14.2 Lessons Learned", 2)
    body(
        doc,
        "The team learned that clear status design is important. For example, Payment Paid and Order Pending can "
        "both be correct at the same time. The team also learned that mobile layout, security for exports, and "
        "careful UI changes matter because one global style update can affect many screens.",
    )

    add_heading_custom(doc, "14.3 Future Directions", 2)
    add_bullets(
        doc,
        [
            "Add a native mobile app for customers and riders",
            "Add more courier API integrations",
            "Improve analytics with more sales filters and export templates",
            "Add advanced fraud checks and richer notification settings",
            "Expand automated tests for critical checkout and delivery flows",
        ],
    )

    # ========== APPENDICES ==========
    add_page_break(doc)
    add_heading_custom(doc, "Appendices", 0)

    add_heading_custom(doc, "Appendix A – Requirements Gathering Documents", 1)
    body(
        doc,
        "This appendix should contain interview notes, survey forms, and other files used to understand user "
        "needs. Insert the actual transcripts and signed forms here.",
    )

    add_heading_custom(doc, "Appendix B – System Design and Diagrams", 1)
    body(
        doc,
        "This appendix should contain the use case diagrams, data flow diagrams, entity relationship diagram, "
        "and architecture diagram of DKMerch.",
    )

    add_heading_custom(doc, "Appendix C – User Interface and System Screenshots", 1)
    body(
        doc,
        "This appendix should contain screenshots of the Home page, Collections, Checkout, Track Order, Admin "
        "Dashboard, Orders modal, Rewards Management, and Rider Dashboard.",
    )

    add_heading_custom(doc, "Appendix D – User Acceptance Testing Forms", 1)
    body(
        doc,
        "This appendix should contain the completed UAT forms signed by evaluators.",
    )

    add_heading_custom(doc, "Appendix E – Development Documentation", 1)
    body(
        doc,
        "This appendix should contain the project timeline, Gantt chart, meeting minutes, and milestone records.",
    )

    add_heading_custom(doc, "Appendix F – Curriculum Vitae", 1)
    body(
        doc,
        "This appendix should contain the curriculum vitae of each group member.",
    )

    add_para(doc, "", space_after=24)
    add_para(doc, "— End of Document —", size=12, italic=True, align="center", space_after=0)

    doc.save(OUT)
    print(f"Saved: {OUT}")

if __name__ == "__main__":
    main()
