/* ================================================================
   PickFlow — Complete Database Creation Script
   Microsoft Access DDL (Jet SQL)
   Version 3.1 · March 2026

   Changes from v3.0:
   - tblClients: Added Address3
   - tblOrders: Added ShipToAddress3, TotalWeightG, ProductVAT, ShippingVAT
   - tblShippingRates: Added MinWeightG, MaxWeightG, ServiceCode
   - tblProducts: Weight field confirmed as grams throughout
   
   HOW TO USE:
   1. Open PickFlow_Back.accdb in Microsoft Access
   2. Go to Create > Query Design
   3. Switch to SQL View (View > SQL View)
   4. Paste each block between the section dividers one at a time
   5. Click Run (!) for each block
   6. Work through the sections in order — do not skip ahead
   
   NOTE: Access does not support running multiple CREATE TABLE
   statements in a single query. Run each CREATE TABLE statement
   individually. You can run all CREATE INDEX statements for a
   table together in one go after the table is created.
================================================================ */


/* ================================================================
   SECTION 1 — FOUNDATION TABLES
   Run these first. Core tables depend on them.
================================================================ */

/* --- 1.1 tblRoles --- */
CREATE TABLE tblRoles (
    RoleID        AUTOINCREMENT CONSTRAINT PK_Roles PRIMARY KEY,
    RoleName      TEXT(50)  NOT NULL,
    Description   TEXT(255),
    CanAccessAdmin  YESNO DEFAULT FALSE,
    CanEditOrders   YESNO DEFAULT FALSE,
    CanEditStock    YESNO DEFAULT FALSE,
    CanEditProducts YESNO DEFAULT FALSE,
    CanEditClients  YESNO DEFAULT FALSE,
    CanEditSuppliers YESNO DEFAULT FALSE,
    CanImport       YESNO DEFAULT FALSE,
    CanExport       YESNO DEFAULT FALSE,
    CanPrintReports YESNO DEFAULT FALSE,
    CanViewReports  YESNO DEFAULT FALSE
);

CREATE UNIQUE INDEX IX_Roles_Name ON tblRoles (RoleName);


/* --- 1.2 tblUsers --- */
CREATE TABLE tblUsers (
    UserID               AUTOINCREMENT CONSTRAINT PK_Users PRIMARY KEY,
    Username             TEXT(50)  NOT NULL,
    PasswordHash         TEXT(255) NOT NULL,
    FirstName            TEXT(100),
    LastName             TEXT(100),
    Email                TEXT(255),
    RoleID               LONG,
    IsActive             YESNO  DEFAULT TRUE,
    ForcePasswordChange  YESNO  DEFAULT TRUE,
    LastLogin            DATETIME,
    FailedLoginCount     INTEGER DEFAULT 0,
    LockedUntil          DATETIME,
    DateCreated          DATETIME,
    CreatedBy            TEXT(100),
    Notes                TEXT(255)
);

CREATE UNIQUE INDEX IX_Users_Username ON tblUsers (Username);
CREATE INDEX IX_Users_RoleID ON tblUsers (RoleID);


/* --- 1.3 tblSessionLog --- */
CREATE TABLE tblSessionLog (
    SessionID            AUTOINCREMENT CONSTRAINT PK_SessionLog PRIMARY KEY,
    UserID               LONG,
    Username             TEXT(50),
    LoginTime            DATETIME,
    LogoutTime           DATETIME,
    MachineName          TEXT(100),
    SessionDurationMins  INTEGER,
    Notes                TEXT(255)
);

CREATE INDEX IX_SessionLog_UserID ON tblSessionLog (UserID);
CREATE INDEX IX_SessionLog_LoginTime ON tblSessionLog (LoginTime);


/* --- 1.4 tblAuditLog --- */
CREATE TABLE tblAuditLog (
    AuditID    AUTOINCREMENT CONSTRAINT PK_AuditLog PRIMARY KEY,
    AuditDate  DATETIME,
    UserID     LONG,
    Username   TEXT(50),
    TableName  TEXT(100),
    RecordID   LONG,
    FieldName  TEXT(100),
    OldValue   MEMO,
    NewValue   MEMO,
    Action     TEXT(20),
    Notes      TEXT(255)
);

CREATE INDEX IX_AuditLog_UserID    ON tblAuditLog (UserID);
CREATE INDEX IX_AuditLog_TableName ON tblAuditLog (TableName);
CREATE INDEX IX_AuditLog_AuditDate ON tblAuditLog (AuditDate);


/* --- 1.5 tblErrorLog --- */
CREATE TABLE tblErrorLog (
    ErrorID           AUTOINCREMENT CONSTRAINT PK_ErrorLog PRIMARY KEY,
    ErrorDate         DATETIME,
    UserID            LONG,
    Username          TEXT(50),
    ErrorNumber       LONG,
    ErrorDescription  TEXT(255),
    ModuleName        TEXT(100),
    ProcedureName     TEXT(100),
    ErrorLine         INTEGER,
    AdditionalInfo    MEMO
);

CREATE INDEX IX_ErrorLog_ErrorDate ON tblErrorLog (ErrorDate);
CREATE INDEX IX_ErrorLog_UserID    ON tblErrorLog (UserID);


/* --- 1.6 tblAppSettings --- */
CREATE TABLE tblAppSettings (
    SettingID     AUTOINCREMENT CONSTRAINT PK_AppSettings PRIMARY KEY,
    SettingKey    TEXT(100) NOT NULL,
    SettingValue  TEXT(255),
    Description   TEXT(255),
    IsEditable    YESNO DEFAULT TRUE,
    LastModified  DATETIME,
    ModifiedBy    TEXT(100)
);

CREATE UNIQUE INDEX IX_AppSettings_Key ON tblAppSettings (SettingKey);


/* --- 1.7 tblVersion --- */
CREATE TABLE tblVersion (
    VersionID     AUTOINCREMENT CONSTRAINT PK_Version PRIMARY KEY,
    VersionNumber TEXT(20),
    ReleaseDate   DATETIME,
    IsCurrent     YESNO DEFAULT FALSE,
    ReleaseNotes  MEMO
);


/* ================================================================
   SECTION 2 — LOOKUP TABLES
   Run before core tables that reference them.
================================================================ */

/* --- 2.1 tblCategories --- */
CREATE TABLE tblCategories (
    CategoryID    AUTOINCREMENT CONSTRAINT PK_Categories PRIMARY KEY,
    CategoryName  TEXT(100) NOT NULL
);

CREATE UNIQUE INDEX IX_Categories_Name ON tblCategories (CategoryName);


/* --- 2.2 tblSubCategories --- */
CREATE TABLE tblSubCategories (
    SubCategoryID   AUTOINCREMENT CONSTRAINT PK_SubCategories PRIMARY KEY,
    CategoryID      LONG NOT NULL,
    SubCategoryName TEXT(100) NOT NULL
);

CREATE INDEX IX_SubCategories_CategoryID ON tblSubCategories (CategoryID);


/* --- 2.3 tblLocationTypes --- */
CREATE TABLE tblLocationTypes (
    LocationTypeID   AUTOINCREMENT CONSTRAINT PK_LocationTypes PRIMARY KEY,
    LocationTypeName TEXT(50) NOT NULL
);


/* --- 2.4 tblShippingRates --- */
CREATE TABLE tblShippingRates (
    ShippingRateID  AUTOINCREMENT CONSTRAINT PK_ShippingRates PRIMARY KEY,
    MethodName      TEXT(100) NOT NULL,
    Carrier         TEXT(100),
    Price           CURRENCY DEFAULT 0,
    IsActive        YESNO DEFAULT TRUE,
    DisplayOrder    INTEGER DEFAULT 99,
    MinWeightG      INTEGER,
    MaxWeightG      INTEGER,
    ServiceCode     TEXT(20),
    Notes           TEXT(255)
);

CREATE UNIQUE INDEX IX_ShippingRates_Method ON tblShippingRates (MethodName);
CREATE INDEX IX_ShippingRates_Active ON tblShippingRates (IsActive);


/* ================================================================
   SECTION 3 — SUPPLIER AND PRODUCT TABLES
================================================================ */

/* --- 3.1 tblSuppliers --- */
CREATE TABLE tblSuppliers (
    SupplierID    AUTOINCREMENT CONSTRAINT PK_Suppliers PRIMARY KEY,
    SupplierName  TEXT(255) NOT NULL,
    ContactName   TEXT(255),
    Email         TEXT(255),
    Phone         TEXT(50),
    Address1      TEXT(255),
    Address2      TEXT(255),
    Town          TEXT(100),
    County        TEXT(100),
    Postcode      TEXT(20),
    Country       TEXT(100) DEFAULT 'United Kingdom',
    PaymentTerms  TEXT(100),
    LeadTimeDays  INTEGER,
    AccountRef    TEXT(100),
    IsActive      YESNO DEFAULT TRUE,
    Notes         MEMO
);

CREATE INDEX IX_Suppliers_Name ON tblSuppliers (SupplierName);


/* --- 3.2 tblProducts --- */
CREATE TABLE tblProducts (
    ProductID              AUTOINCREMENT CONSTRAINT PK_Products PRIMARY KEY,
    SKU                    TEXT(50)  NOT NULL,
    ProductName            TEXT(255) NOT NULL,
    Description            MEMO,
    Category               TEXT(100),
    SubCategory            TEXT(100),
    Brand                  TEXT(100),
    UnitOfMeasure          TEXT(50),
    Barcode                TEXT(100),
    SalesPrice             CURRENCY DEFAULT 0,
    ReducedWholesalePrice  CURRENCY DEFAULT 0,
    CostPrice              CURRENCY DEFAULT 0,
    VATStatus              TEXT(20) DEFAULT 'Standard',
    Weight                 DOUBLE,
    Width                  DOUBLE,
    Height                 DOUBLE,
    Depth                  DOUBLE,
    ReorderLevel           INTEGER DEFAULT 0,
    ReorderQty             INTEGER DEFAULT 0,
    LeadTimeDays           INTEGER DEFAULT 0,
    IsActive               YESNO DEFAULT TRUE,
    IsDropship             YESNO DEFAULT FALSE,
    PickingBinTracked      YESNO DEFAULT FALSE,
    BagSizeDefault         INTEGER DEFAULT 0,
    ProductNotes           MEMO,
    ProductImagePath       TEXT(255),
    DateAdded              DATETIME,
    LastModified           DATETIME
);

CREATE UNIQUE INDEX IX_Products_SKU       ON tblProducts (SKU);
CREATE INDEX IX_Products_Category         ON tblProducts (Category);
CREATE INDEX IX_Products_IsActive         ON tblProducts (IsActive);
CREATE INDEX IX_Products_PickingBinTracked ON tblProducts (PickingBinTracked);


/* --- 3.3 tblProductSuppliers --- */
CREATE TABLE tblProductSuppliers (
    ProductSupplierID  AUTOINCREMENT CONSTRAINT PK_ProductSuppliers PRIMARY KEY,
    ProductID          LONG NOT NULL,
    SupplierID         LONG NOT NULL,
    SupplierSKU        TEXT(100),
    UnitCost           CURRENCY DEFAULT 0,
    MinOrderQty        INTEGER DEFAULT 1,
    LeadTimeDays       INTEGER,
    IsPreferred        YESNO DEFAULT FALSE,
    Notes              TEXT(255)
);

CREATE INDEX IX_ProductSuppliers_ProductID  ON tblProductSuppliers (ProductID);
CREATE INDEX IX_ProductSuppliers_SupplierID ON tblProductSuppliers (SupplierID);
CREATE INDEX IX_ProductSuppliers_Preferred  ON tblProductSuppliers (IsPreferred);


/* ================================================================
   SECTION 4 — LOCATION AND STOCK TABLES
================================================================ */

/* --- 4.1 tblLocations --- */
CREATE TABLE tblLocations (
    LocationID    AUTOINCREMENT CONSTRAINT PK_Locations PRIMARY KEY,
    LocationCode  TEXT(50)  NOT NULL,
    LocationName  TEXT(255),
    LocationType  TEXT(50),
    Zone          TEXT(100),
    IsActive      YESNO DEFAULT TRUE,
    Notes         MEMO
);

CREATE UNIQUE INDEX IX_Locations_Code ON tblLocations (LocationCode);
CREATE INDEX IX_Locations_Type        ON tblLocations (LocationType);
CREATE INDEX IX_Locations_Zone        ON tblLocations (Zone);


/* --- 4.2 tblBatches (skeleton — unused until batch tracking activated) --- */
CREATE TABLE tblBatches (
    BatchID           AUTOINCREMENT CONSTRAINT PK_Batches PRIMARY KEY,
    BatchReference    TEXT(100),
    ProductID         LONG,
    SupplierID        LONG,
    POID              LONG,
    ReceivedDate      DATETIME,
    ExpiryDate        DATETIME,
    QuantityReceived  INTEGER DEFAULT 0,
    QuantityRemaining INTEGER DEFAULT 0,
    Notes             MEMO,
    IsActive          YESNO DEFAULT TRUE
);

CREATE INDEX IX_Batches_ProductID ON tblBatches (ProductID);
CREATE INDEX IX_Batches_POID      ON tblBatches (POID);


/* --- 4.3 tblStockLevels --- */
CREATE TABLE tblStockLevels (
    StockLevelID    AUTOINCREMENT CONSTRAINT PK_StockLevels PRIMARY KEY,
    ProductID       LONG NOT NULL,
    LocationID      LONG NOT NULL,
    QuantityOnHand  INTEGER DEFAULT 0,
    BagSize         INTEGER DEFAULT 0,
    PickPriority    INTEGER DEFAULT 0,
    LastCountDate   DATETIME,
    LastCountBy     TEXT(100),
    BatchID         LONG,
    Notes           TEXT(255)
);

/* Composite unique index — one record per product per location */
CREATE UNIQUE INDEX IX_StockLevels_ProductLocation ON tblStockLevels (ProductID, LocationID);
CREATE INDEX IX_StockLevels_LocationID ON tblStockLevels (LocationID);
CREATE INDEX IX_StockLevels_PickPriority ON tblStockLevels (PickPriority);


/* --- 4.4 tblStockMovements --- */
CREATE TABLE tblStockMovements (
    MovementID      AUTOINCREMENT CONSTRAINT PK_StockMovements PRIMARY KEY,
    MovementDate    DATETIME,
    MovementType    TEXT(50),
    ProductID       LONG NOT NULL,
    FromLocationID  LONG,
    ToLocationID    LONG,
    Quantity        INTEGER DEFAULT 0,
    Reference       TEXT(100),
    Reason          TEXT(255),
    CreatedBy       TEXT(100),
    BatchID         LONG,
    Notes           MEMO
);

CREATE INDEX IX_StockMovements_ProductID      ON tblStockMovements (ProductID);
CREATE INDEX IX_StockMovements_FromLocationID ON tblStockMovements (FromLocationID);
CREATE INDEX IX_StockMovements_ToLocationID   ON tblStockMovements (ToLocationID);
CREATE INDEX IX_StockMovements_MovementDate   ON tblStockMovements (MovementDate);
CREATE INDEX IX_StockMovements_MovementType   ON tblStockMovements (MovementType);


/* ================================================================
   SECTION 5 — CLIENT AND ORDER TABLES
================================================================ */

/* --- 5.1 tblClients --- */
CREATE TABLE tblClients (
    ClientID           AUTOINCREMENT CONSTRAINT PK_Clients PRIMARY KEY,
    ClientCode         TEXT(50),
    CompanyName        TEXT(255),
    FirstName          TEXT(100),
    LastName           TEXT(100),
    Email              TEXT(255),
    Phone              TEXT(50),
    Address1           TEXT(255),
    Address2           TEXT(255),
    Address3           TEXT(255),
    Town               TEXT(100),
    County             TEXT(100),
    Postcode           TEXT(20),
    Country            TEXT(100) DEFAULT 'United Kingdom',
    Source             TEXT(50),
    IsReducedWholesale YESNO DEFAULT FALSE,
    DefaultBlindShip   YESNO DEFAULT FALSE,
    ClientLogoPath     TEXT(255),
    IsActive           YESNO DEFAULT TRUE,
    DateAdded          DATETIME,
    Notes              MEMO
);

CREATE UNIQUE INDEX IX_Clients_Email     ON tblClients (Email);
CREATE UNIQUE INDEX IX_Clients_Code      ON tblClients (ClientCode);
CREATE INDEX IX_Clients_CompanyName      ON tblClients (CompanyName);
CREATE INDEX IX_Clients_Postcode         ON tblClients (Postcode);


/* --- 5.2 tblClientPricing --- */
CREATE TABLE tblClientPricing (
    ClientPricingID  AUTOINCREMENT CONSTRAINT PK_ClientPricing PRIMARY KEY,
    ClientID         LONG NOT NULL,
    PricingType      TEXT(50),
    ProductID        LONG,
    CategoryID       LONG,
    FixedPrice       CURRENCY,
    DiscountPercent  DOUBLE DEFAULT 0,
    IsActive         YESNO DEFAULT TRUE,
    Notes            TEXT(255)
);

CREATE INDEX IX_ClientPricing_ClientID   ON tblClientPricing (ClientID);
CREATE INDEX IX_ClientPricing_ProductID  ON tblClientPricing (ProductID);
CREATE INDEX IX_ClientPricing_CategoryID ON tblClientPricing (CategoryID);


/* --- 5.3 tblOrders --- */
CREATE TABLE tblOrders (
    OrderID            AUTOINCREMENT CONSTRAINT PK_Orders PRIMARY KEY,
    OrderNumber        TEXT(50),
    ClientID           LONG NOT NULL,
    OrderDate          DATETIME,
    RequiredDate       DATETIME,
    OrderSource        TEXT(50),
    ExternalOrderRef   TEXT(100),
    Status             TEXT(50) DEFAULT 'New',
    IsBlindShip        YESNO DEFAULT FALSE,
    ShipToName         TEXT(255),
    ShipToAddress1     TEXT(255),
    ShipToAddress2     TEXT(255),
    ShipToAddress3     TEXT(255),
    ShipToTown         TEXT(100),
    ShipToCounty       TEXT(100),
    ShipToPostcode     TEXT(20),
    ShipToCountry      TEXT(100) DEFAULT 'United Kingdom',
    ShippingMethod     TEXT(100),
    TrackingNumber     TEXT(100),
    DespatchDate       DATETIME,
    SubTotal           CURRENCY DEFAULT 0,
    ProductVAT         CURRENCY DEFAULT 0,
    ShippingVAT        CURRENCY DEFAULT 0,
    TotalVAT           CURRENCY DEFAULT 0,
    ShippingCost       CURRENCY DEFAULT 0,
    OrderTotal         CURRENCY DEFAULT 0,
    OrderTotalIncVAT   CURRENCY DEFAULT 0,
    TotalWeightG       INTEGER DEFAULT 0,
    Notes              MEMO,
    CreatedBy          TEXT(100)
);

CREATE UNIQUE INDEX IX_Orders_OrderNumber    ON tblOrders (OrderNumber);
CREATE INDEX IX_Orders_ClientID              ON tblOrders (ClientID);
CREATE INDEX IX_Orders_Status                ON tblOrders (Status);
CREATE INDEX IX_Orders_OrderDate             ON tblOrders (OrderDate);
CREATE INDEX IX_Orders_ExternalOrderRef      ON tblOrders (ExternalOrderRef);


/* --- 5.4 tblOrderLines --- */
CREATE TABLE tblOrderLines (
    OrderLineID      AUTOINCREMENT CONSTRAINT PK_OrderLines PRIMARY KEY,
    OrderID          LONG NOT NULL,
    ProductID        LONG,
    BundleID         LONG,
    BackOrderID      LONG,
    SKU              TEXT(50),
    ProductName      TEXT(255),
    QuantityOrdered  INTEGER DEFAULT 0,
    QuantityPicked   INTEGER DEFAULT 0,
    UnitPrice        CURRENCY DEFAULT 0,
    LineTotal        CURRENCY DEFAULT 0,
    VATStatus        TEXT(20) DEFAULT 'Standard',
    VATRate          DOUBLE DEFAULT 0,
    VATAmount        CURRENCY DEFAULT 0,
    LineTotalIncVAT  CURRENCY DEFAULT 0,
    Status           TEXT(50) DEFAULT 'Pending',
    Notes            TEXT(255)
);

CREATE INDEX IX_OrderLines_OrderID   ON tblOrderLines (OrderID);
CREATE INDEX IX_OrderLines_ProductID ON tblOrderLines (ProductID);
CREATE INDEX IX_OrderLines_Status    ON tblOrderLines (Status);
CREATE INDEX IX_OrderLines_BundleID  ON tblOrderLines (BundleID);


/* ================================================================
   SECTION 6 — PURCHASE ORDER TABLES
================================================================ */

/* --- 6.1 tblPurchaseOrders --- */
CREATE TABLE tblPurchaseOrders (
    POID            AUTOINCREMENT CONSTRAINT PK_PurchaseOrders PRIMARY KEY,
    PONumber        TEXT(50),
    SupplierID      LONG NOT NULL,
    OrderDate       DATETIME,
    ExpectedDate    DATETIME,
    ReceivedDate    DATETIME,
    Status          TEXT(50) DEFAULT 'Draft',
    FulfilsOrderID  LONG,
    IsDropshipPO    YESNO DEFAULT FALSE,
    SubTotal        CURRENCY DEFAULT 0,
    DeliveryCost    CURRENCY DEFAULT 0,
    POTotal         CURRENCY DEFAULT 0,
    Notes           MEMO,
    CreatedBy       TEXT(100)
);

CREATE UNIQUE INDEX IX_PurchaseOrders_PONumber    ON tblPurchaseOrders (PONumber);
CREATE INDEX IX_PurchaseOrders_SupplierID         ON tblPurchaseOrders (SupplierID);
CREATE INDEX IX_PurchaseOrders_Status             ON tblPurchaseOrders (Status);
CREATE INDEX IX_PurchaseOrders_FulfilsOrderID     ON tblPurchaseOrders (FulfilsOrderID);


/* --- 6.2 tblPurchaseOrderLines --- */
CREATE TABLE tblPurchaseOrderLines (
    POLineID                AUTOINCREMENT CONSTRAINT PK_POLines PRIMARY KEY,
    POID                    LONG NOT NULL,
    ProductID               LONG NOT NULL,
    QuantityOrdered         INTEGER DEFAULT 0,
    QuantityReceived        INTEGER DEFAULT 0,
    UnitCostUSD             CURRENCY DEFAULT 0,
    UnitCost                CURRENCY DEFAULT 0,
    LandedCostGBP           CURRENCY DEFAULT 0,
    LandedCostCalculated    YESNO DEFAULT FALSE,
    LineTotal               CURRENCY DEFAULT 0,
    DeliverToLocationID     LONG,
    Status                  TEXT(50) DEFAULT 'Pending'
);

CREATE INDEX IX_POLines_POID                ON tblPurchaseOrderLines (POID);
CREATE INDEX IX_POLines_ProductID           ON tblPurchaseOrderLines (ProductID);
CREATE INDEX IX_POLines_DeliverToLocationID ON tblPurchaseOrderLines (DeliverToLocationID);


/* --- 6.3 tblSupplierInvoices --- */
CREATE TABLE tblSupplierInvoices (
    InvoiceID           AUTOINCREMENT CONSTRAINT PK_SupplierInvoices PRIMARY KEY,
    InvoiceNumber       TEXT(100),
    POID                LONG NOT NULL,
    SupplierID          LONG NOT NULL,
    InvoiceDate         DATETIME,
    ReceivedDate        DATETIME,
    ProductCostUSD      CURRENCY DEFAULT 0,
    DeliveryCostUSD     CURRENCY DEFAULT 0,
    ImportDutyGBP       CURRENCY DEFAULT 0,
    ExchangeRate        DOUBLE DEFAULT 1,
    ProductCostGBP      CURRENCY DEFAULT 0,
    DeliveryCostGBP     CURRENCY DEFAULT 0,
    TotalLandedCostGBP  CURRENCY DEFAULT 0,
    Status              TEXT(50) DEFAULT 'Received',
    Notes               MEMO,
    ProcessedBy         TEXT(100),
    ProcessedDate       DATETIME
);

CREATE INDEX IX_SupplierInvoices_POID       ON tblSupplierInvoices (POID);
CREATE INDEX IX_SupplierInvoices_SupplierID ON tblSupplierInvoices (SupplierID);
CREATE INDEX IX_SupplierInvoices_Status     ON tblSupplierInvoices (Status);


/* ================================================================
   SECTION 7 — PICKING TABLES
================================================================ */

/* --- 7.1 tblPickingLists --- */
CREATE TABLE tblPickingLists (
    PickingListID  AUTOINCREMENT CONSTRAINT PK_PickingLists PRIMARY KEY,
    OrderID        LONG NOT NULL,
    GeneratedDate  DATETIME,
    GeneratedBy    TEXT(100),
    Status         TEXT(50) DEFAULT 'Generated',
    Mode           TEXT(20) DEFAULT '1'
);

CREATE INDEX IX_PickingLists_OrderID ON tblPickingLists (OrderID);
CREATE INDEX IX_PickingLists_Status  ON tblPickingLists (Status);


/* --- 7.2 tblPickingListLines --- */
CREATE TABLE tblPickingListLines (
    PickingLineID       AUTOINCREMENT CONSTRAINT PK_PickingListLines PRIMARY KEY,
    PickingListID       LONG NOT NULL,
    OrderLineID         LONG NOT NULL,
    ProductID           LONG NOT NULL,
    SKU                 TEXT(50),
    ProductName         TEXT(255),
    PickFromLocationID  LONG,
    QuantityToPick      INTEGER DEFAULT 0,
    MoveToPickingBin    INTEGER DEFAULT 0,
    PickSequence        INTEGER DEFAULT 0,
    Instruction         TEXT(255),
    IsCompleted         YESNO DEFAULT FALSE
);

CREATE INDEX IX_PickingListLines_PickingListID ON tblPickingListLines (PickingListID);
CREATE INDEX IX_PickingListLines_OrderLineID   ON tblPickingListLines (OrderLineID);
CREATE INDEX IX_PickingListLines_PickSequence  ON tblPickingListLines (PickSequence);
CREATE INDEX IX_PickingListLines_IsCompleted   ON tblPickingListLines (IsCompleted);


/* ================================================================
   SECTION 8 — QUOTE TABLES
================================================================ */

/* --- 8.1 tblQuotes --- */
CREATE TABLE tblQuotes (
    QuoteID             AUTOINCREMENT CONSTRAINT PK_Quotes PRIMARY KEY,
    QuoteNumber         TEXT(50),
    ClientID            LONG NOT NULL,
    QuoteDate           DATETIME,
    ValidUntil          DATETIME,
    Status              TEXT(50) DEFAULT 'Draft',
    ConvertedToOrderID  LONG,
    SentDate            DATETIME,
    ResponseDate        DATETIME,
    SubTotal            CURRENCY DEFAULT 0,
    Notes               MEMO,
    CreatedBy           TEXT(100)
);

CREATE UNIQUE INDEX IX_Quotes_QuoteNumber    ON tblQuotes (QuoteNumber);
CREATE INDEX IX_Quotes_ClientID              ON tblQuotes (ClientID);
CREATE INDEX IX_Quotes_Status                ON tblQuotes (Status);
CREATE INDEX IX_Quotes_ValidUntil            ON tblQuotes (ValidUntil);


/* --- 8.2 tblQuoteLines --- */
CREATE TABLE tblQuoteLines (
    QuoteLineID   AUTOINCREMENT CONSTRAINT PK_QuoteLines PRIMARY KEY,
    QuoteID       LONG NOT NULL,
    LineType      TEXT(20) DEFAULT 'Standard',
    ProductID     LONG,
    CustomJobID   LONG,
    Description   TEXT(255),
    Quantity      INTEGER DEFAULT 0,
    UnitPrice     CURRENCY DEFAULT 0,
    LineTotal     CURRENCY DEFAULT 0,
    Notes         TEXT(255)
);

CREATE INDEX IX_QuoteLines_QuoteID    ON tblQuoteLines (QuoteID);
CREATE INDEX IX_QuoteLines_ProductID  ON tblQuoteLines (ProductID);
CREATE INDEX IX_QuoteLines_LineType   ON tblQuoteLines (LineType);


/* ================================================================
   SECTION 9 — CUSTOM JOBS TABLES
================================================================ */

/* --- 9.1 tblCustomJobs --- */
CREATE TABLE tblCustomJobs (
    CustomJobID             AUTOINCREMENT CONSTRAINT PK_CustomJobs PRIMARY KEY,
    JobReference            TEXT(50),
    JobName                 TEXT(255),
    ClientID                LONG NOT NULL,
    OrderID                 LONG,
    QuoteID                 LONG,
    Status                  TEXT(50) DEFAULT 'Enquiry',
    JobSpec                 MEMO,
    IsReorderableSpec       YESNO DEFAULT FALSE,
    SpecCode                TEXT(50),
    SupplierID              LONG,
    ArtworkRequired         YESNO DEFAULT FALSE,
    ArtworkApprovedDate     DATETIME,
    ArtworkApprovedBy       TEXT(100),
    ProductionStartDate     DATETIME,
    ExpectedCompletionDate  DATETIME,
    ActualCompletionDate    DATETIME,
    Quantity                INTEGER DEFAULT 0,
    QuotedPrice             CURRENCY DEFAULT 0,
    FinalPrice              CURRENCY DEFAULT 0,
    Notes                   MEMO,
    CreatedBy               TEXT(100),
    DateCreated             DATETIME
);

CREATE UNIQUE INDEX IX_CustomJobs_JobReference ON tblCustomJobs (JobReference);
CREATE INDEX IX_CustomJobs_ClientID            ON tblCustomJobs (ClientID);
CREATE INDEX IX_CustomJobs_Status              ON tblCustomJobs (Status);
CREATE INDEX IX_CustomJobs_SpecCode            ON tblCustomJobs (SpecCode);
CREATE INDEX IX_CustomJobs_IsReorderableSpec   ON tblCustomJobs (IsReorderableSpec);


/* --- 9.2 tblCustomJobCosts --- */
CREATE TABLE tblCustomJobCosts (
    JobCostID         AUTOINCREMENT CONSTRAINT PK_CustomJobCosts PRIMARY KEY,
    CustomJobID       LONG NOT NULL,
    CostType          TEXT(50),
    SupplierID        LONG,
    Description       TEXT(255),
    EstimatedCost     CURRENCY DEFAULT 0,
    ActualCost        CURRENCY DEFAULT 0,
    CostDate          DATETIME,
    InvoiceReference  TEXT(100),
    Notes             TEXT(255)
);

CREATE INDEX IX_CustomJobCosts_CustomJobID ON tblCustomJobCosts (CustomJobID);
CREATE INDEX IX_CustomJobCosts_CostType    ON tblCustomJobCosts (CostType);


/* ================================================================
   SECTION 10 — RETURNS TABLES
================================================================ */

/* --- 10.1 tblReturns --- */
CREATE TABLE tblReturns (
    ReturnID          AUTOINCREMENT CONSTRAINT PK_Returns PRIMARY KEY,
    ReturnReference   TEXT(50),
    ReturnType        TEXT(50),
    ReturnDate        DATETIME,
    ClientID          LONG,
    SupplierID        LONG,
    OriginalOrderID   LONG,
    OriginalPOID      LONG,
    Status            TEXT(50) DEFAULT 'Received',
    ReturnReason      TEXT(255),
    CreditNoteRef     TEXT(100),
    CreditAmount      CURRENCY DEFAULT 0,
    Notes             MEMO,
    ProcessedBy       TEXT(100),
    DateCreated       DATETIME
);

CREATE UNIQUE INDEX IX_Returns_ReturnReference ON tblReturns (ReturnReference);
CREATE INDEX IX_Returns_ClientID               ON tblReturns (ClientID);
CREATE INDEX IX_Returns_SupplierID             ON tblReturns (SupplierID);
CREATE INDEX IX_Returns_OriginalOrderID        ON tblReturns (OriginalOrderID);
CREATE INDEX IX_Returns_Status                 ON tblReturns (Status);


/* --- 10.2 tblReturnLines --- */
CREATE TABLE tblReturnLines (
    ReturnLineID        AUTOINCREMENT CONSTRAINT PK_ReturnLines PRIMARY KEY,
    ReturnID            LONG NOT NULL,
    ProductID           LONG NOT NULL,
    SKU                 TEXT(50),
    QuantityReturned    INTEGER DEFAULT 0,
    ReturnToLocationID  LONG,
    UnitValue           CURRENCY DEFAULT 0,
    LineValue           CURRENCY DEFAULT 0,
    Notes               TEXT(255)
);

CREATE INDEX IX_ReturnLines_ReturnID            ON tblReturnLines (ReturnID);
CREATE INDEX IX_ReturnLines_ProductID           ON tblReturnLines (ProductID);
CREATE INDEX IX_ReturnLines_ReturnToLocationID  ON tblReturnLines (ReturnToLocationID);


/* ================================================================
   SECTION 11 — BUNDLE TABLES
================================================================ */

/* --- 11.1 tblBundles --- */
CREATE TABLE tblBundles (
    BundleID     AUTOINCREMENT CONSTRAINT PK_Bundles PRIMARY KEY,
    BundleName   TEXT(255) NOT NULL,
    BundleCode   TEXT(50),
    Description  MEMO,
    SalesPrice   CURRENCY DEFAULT 0,
    IsActive     YESNO DEFAULT TRUE,
    Notes        TEXT(255)
);

CREATE UNIQUE INDEX IX_Bundles_BundleCode ON tblBundles (BundleCode);
CREATE INDEX IX_Bundles_IsActive          ON tblBundles (IsActive);


/* --- 11.2 tblBundleComponents --- */
CREATE TABLE tblBundleComponents (
    BundleComponentID  AUTOINCREMENT CONSTRAINT PK_BundleComponents PRIMARY KEY,
    BundleID           LONG NOT NULL,
    ProductID          LONG NOT NULL,
    Quantity           INTEGER DEFAULT 1,
    Notes              TEXT(255)
);

CREATE INDEX IX_BundleComponents_BundleID   ON tblBundleComponents (BundleID);
CREATE INDEX IX_BundleComponents_ProductID  ON tblBundleComponents (ProductID);


/* ================================================================
   SECTION 12 — SKELETON TABLES
   Structure only — no forms or logic until features are activated.
================================================================ */

/* --- 12.1 tblBackOrders --- */
CREATE TABLE tblBackOrders (
    BackOrderID              AUTOINCREMENT CONSTRAINT PK_BackOrders PRIMARY KEY,
    OriginalOrderLineID      LONG,
    ProductID                LONG,
    ClientID                 LONG,
    QuantityOutstanding      INTEGER DEFAULT 0,
    Status                   TEXT(50) DEFAULT 'Open',
    DateCreated              DATETIME,
    ExpectedFulfilmentDate   DATETIME,
    Notes                    TEXT(255)
);

CREATE INDEX IX_BackOrders_ProductID           ON tblBackOrders (ProductID);
CREATE INDEX IX_BackOrders_ClientID            ON tblBackOrders (ClientID);
CREATE INDEX IX_BackOrders_OriginalOrderLineID ON tblBackOrders (OriginalOrderLineID);
CREATE INDEX IX_BackOrders_Status              ON tblBackOrders (Status);


/* ================================================================
   END OF SCRIPT

   All 28 tables are now created with indexes.

   NEXT STEPS:
   1. Open Database Tools > Relationships
   2. Add all tables
   3. Create relationships per Section 6 of the Build Guide
   4. Link all tables into PickFlow_Front.accdb
   5. Run the sample data SQL from Section 7 of the Build Guide

   Tables created (28 total):
   Foundation  : tblRoles, tblUsers, tblSessionLog, tblAuditLog,
                 tblErrorLog, tblAppSettings, tblVersion
   Lookups     : tblCategories, tblSubCategories, tblLocationTypes,
                 tblShippingRates
   Supplier    : tblSuppliers, tblProductSuppliers
   Product     : tblProducts
   Location    : tblLocations, tblBatches (skeleton)
   Stock       : tblStockLevels, tblStockMovements
   Client      : tblClients, tblClientPricing
   Order       : tblOrders, tblOrderLines
   Purchase    : tblPurchaseOrders, tblPurchaseOrderLines,
                 tblSupplierInvoices
   Picking     : tblPickingLists, tblPickingListLines
   Quotes      : tblQuotes, tblQuoteLines
   Custom      : tblCustomJobs, tblCustomJobCosts
   Returns     : tblReturns, tblReturnLines
   Bundles     : tblBundles, tblBundleComponents
   Skeleton    : tblBackOrders
================================================================ */
