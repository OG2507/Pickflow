/* ================================================================
   PickFlow — PostgreSQL Schema
   Translated from Access DDL v3.0
   Target: Supabase (PostgreSQL)
   Version: 1.0 · April 2026

   HOW TO USE:
   1. Go to your Supabase project dashboard
   2. Click SQL Editor in the left sidebar
   3. Paste this entire script
   4. Click Run
   5. All 28 tables will be created in one go

   Type mapping from Access:
     AUTOINCREMENT  → serial (auto-incrementing integer)
     LONG           → integer
     INTEGER        → smallint
     DOUBLE         → double precision
     CURRENCY       → numeric(10,2)
     TEXT(n)        → varchar(n)
     MEMO           → text
     DATETIME       → timestamptz
     YESNO          → boolean
================================================================ */


/* ================================================================
   SECTION 1 — FOUNDATION TABLES
================================================================ */

-- 1.1 tblRoles
CREATE TABLE tblRoles (
    RoleID            serial        PRIMARY KEY,
    RoleName          varchar(50)   NOT NULL,
    Description       varchar(255),
    CanAccessAdmin    boolean       DEFAULT false,
    CanEditOrders     boolean       DEFAULT false,
    CanEditStock      boolean       DEFAULT false,
    CanEditProducts   boolean       DEFAULT false,
    CanEditClients    boolean       DEFAULT false,
    CanEditSuppliers  boolean       DEFAULT false,
    CanImport         boolean       DEFAULT false,
    CanExport         boolean       DEFAULT false,
    CanPrintReports   boolean       DEFAULT false,
    CanViewReports    boolean       DEFAULT false
);

CREATE UNIQUE INDEX IX_Roles_Name ON tblRoles (RoleName);


-- 1.2 tblUsers
CREATE TABLE tblUsers (
    UserID                serial        PRIMARY KEY,
    Username              varchar(50)   NOT NULL,
    PasswordHash          varchar(255)  NOT NULL,
    FirstName             varchar(100),
    LastName              varchar(100),
    Email                 varchar(255),
    RoleID                integer,
    IsActive              boolean       DEFAULT true,
    ForcePasswordChange   boolean       DEFAULT true,
    LastLogin             timestamptz,
    FailedLoginCount      smallint      DEFAULT 0,
    LockedUntil           timestamptz,
    DateCreated           timestamptz,
    CreatedBy             varchar(100),
    Notes                 varchar(255)
);

CREATE UNIQUE INDEX IX_Users_Username ON tblUsers (Username);
CREATE INDEX IX_Users_RoleID ON tblUsers (RoleID);


-- 1.3 tblSessionLog
CREATE TABLE tblSessionLog (
    SessionID             serial        PRIMARY KEY,
    UserID                integer,
    Username              varchar(50),
    LoginTime             timestamptz,
    LogoutTime            timestamptz,
    MachineName           varchar(100),
    SessionDurationMins   smallint,
    Notes                 varchar(255)
);

CREATE INDEX IX_SessionLog_UserID    ON tblSessionLog (UserID);
CREATE INDEX IX_SessionLog_LoginTime ON tblSessionLog (LoginTime);


-- 1.4 tblAuditLog
CREATE TABLE tblAuditLog (
    AuditID    serial        PRIMARY KEY,
    AuditDate  timestamptz,
    UserID     integer,
    Username   varchar(50),
    TableName  varchar(100),
    RecordID   integer,
    FieldName  varchar(100),
    OldValue   text,
    NewValue   text,
    Action     varchar(20),
    Notes      varchar(255)
);

CREATE INDEX IX_AuditLog_UserID    ON tblAuditLog (UserID);
CREATE INDEX IX_AuditLog_TableName ON tblAuditLog (TableName);
CREATE INDEX IX_AuditLog_AuditDate ON tblAuditLog (AuditDate);


-- 1.5 tblErrorLog
CREATE TABLE tblErrorLog (
    ErrorID            serial        PRIMARY KEY,
    ErrorDate          timestamptz,
    UserID             integer,
    Username           varchar(50),
    ErrorNumber        integer,
    ErrorDescription   varchar(255),
    ModuleName         varchar(100),
    ProcedureName      varchar(100),
    ErrorLine          smallint,
    AdditionalInfo     text
);

CREATE INDEX IX_ErrorLog_ErrorDate ON tblErrorLog (ErrorDate);
CREATE INDEX IX_ErrorLog_UserID    ON tblErrorLog (UserID);


-- 1.6 tblAppSettings
CREATE TABLE tblAppSettings (
    SettingID     serial        PRIMARY KEY,
    SettingKey    varchar(100)  NOT NULL,
    SettingValue  varchar(255),
    Description   varchar(255),
    IsEditable    boolean       DEFAULT true,
    LastModified  timestamptz,
    ModifiedBy    varchar(100)
);

CREATE UNIQUE INDEX IX_AppSettings_Key ON tblAppSettings (SettingKey);


-- 1.7 tblVersion
CREATE TABLE tblVersion (
    VersionID      serial       PRIMARY KEY,
    VersionNumber  varchar(20),
    ReleaseDate    timestamptz,
    IsCurrent      boolean      DEFAULT false,
    ReleaseNotes   text
);


/* ================================================================
   SECTION 2 — LOOKUP TABLES
================================================================ */

-- 2.1 tblCategories
CREATE TABLE tblCategories (
    CategoryID    serial        PRIMARY KEY,
    CategoryName  varchar(100)  NOT NULL
);

CREATE UNIQUE INDEX IX_Categories_Name ON tblCategories (CategoryName);


-- 2.2 tblSubCategories
CREATE TABLE tblSubCategories (
    SubCategoryID    serial        PRIMARY KEY,
    CategoryID       integer       NOT NULL,
    SubCategoryName  varchar(100)  NOT NULL
);

CREATE INDEX IX_SubCategories_CategoryID ON tblSubCategories (CategoryID);


-- 2.3 tblLocationTypes
CREATE TABLE tblLocationTypes (
    LocationTypeID    serial       PRIMARY KEY,
    LocationTypeName  varchar(50)  NOT NULL
);


-- 2.4 tblShippingRates
CREATE TABLE tblShippingRates (
    ShippingRateID  serial          PRIMARY KEY,
    MethodName      varchar(100)    NOT NULL,
    Carrier         varchar(100),
    Price           numeric(10,2)   DEFAULT 0,
    IsActive        boolean         DEFAULT true,
    DisplayOrder    smallint        DEFAULT 99,
    Notes           varchar(255)
);

CREATE UNIQUE INDEX IX_ShippingRates_Method ON tblShippingRates (MethodName);
CREATE INDEX IX_ShippingRates_Active        ON tblShippingRates (IsActive);


/* ================================================================
   SECTION 3 — SUPPLIER AND PRODUCT TABLES
================================================================ */

-- 3.1 tblSuppliers
CREATE TABLE tblSuppliers (
    SupplierID    serial          PRIMARY KEY,
    SupplierName  varchar(255)    NOT NULL,
    ContactName   varchar(255),
    Email         varchar(255),
    Phone         varchar(50),
    Address1      varchar(255),
    Address2      varchar(255),
    Town          varchar(100),
    County        varchar(100),
    Postcode      varchar(20),
    Country       varchar(100)    DEFAULT 'United Kingdom',
    PaymentTerms  varchar(100),
    LeadTimeDays  smallint,
    AccountRef    varchar(100),
    IsActive      boolean         DEFAULT true,
    Notes         text
);

CREATE INDEX IX_Suppliers_Name ON tblSuppliers (SupplierName);


-- 3.2 tblProducts
CREATE TABLE tblProducts (
    ProductID               serial          PRIMARY KEY,
    SKU                     varchar(50)     NOT NULL,
    ProductName             varchar(255)    NOT NULL,
    Description             text,
    Category                varchar(100),
    SubCategory             varchar(100),
    Brand                   varchar(100),
    UnitOfMeasure           varchar(50),
    Barcode                 varchar(100),
    SalesPrice              numeric(10,2)   DEFAULT 0,
    ReducedWholesalePrice   numeric(10,2)   DEFAULT 0,
    CostPrice               numeric(10,2)   DEFAULT 0,
    VATStatus               varchar(20)     DEFAULT 'Standard',
    Weight                  double precision,
    Width                   double precision,
    Height                  double precision,
    Depth                   double precision,
    ReorderLevel            smallint        DEFAULT 0,
    ReorderQty              smallint        DEFAULT 0,
    LeadTimeDays            smallint        DEFAULT 0,
    IsActive                boolean         DEFAULT true,
    IsDropship              boolean         DEFAULT false,
    PickingBinTracked       boolean         DEFAULT false,
    BagSizeDefault          smallint        DEFAULT 0,
    ProductNotes            text,
    ProductImagePath        varchar(255),
    DateAdded               timestamptz,
    LastModified            timestamptz
);

CREATE UNIQUE INDEX IX_Products_SKU            ON tblProducts (SKU);
CREATE INDEX IX_Products_Category              ON tblProducts (Category);
CREATE INDEX IX_Products_IsActive              ON tblProducts (IsActive);
CREATE INDEX IX_Products_PickingBinTracked     ON tblProducts (PickingBinTracked);


-- 3.3 tblProductSuppliers
CREATE TABLE tblProductSuppliers (
    ProductSupplierID  serial          PRIMARY KEY,
    ProductID          integer         NOT NULL,
    SupplierID         integer         NOT NULL,
    SupplierSKU        varchar(100),
    UnitCost           numeric(10,2)   DEFAULT 0,
    MinOrderQty        smallint        DEFAULT 1,
    LeadTimeDays       smallint,
    IsPreferred        boolean         DEFAULT false,
    Notes              varchar(255)
);

CREATE INDEX IX_ProductSuppliers_ProductID  ON tblProductSuppliers (ProductID);
CREATE INDEX IX_ProductSuppliers_SupplierID ON tblProductSuppliers (SupplierID);
CREATE INDEX IX_ProductSuppliers_Preferred  ON tblProductSuppliers (IsPreferred);


/* ================================================================
   SECTION 4 — LOCATION AND STOCK TABLES
================================================================ */

-- 4.1 tblLocations
CREATE TABLE tblLocations (
    LocationID    serial        PRIMARY KEY,
    LocationCode  varchar(50)   NOT NULL,
    LocationName  varchar(255),
    LocationType  varchar(50),
    Zone          varchar(100),
    IsActive      boolean       DEFAULT true,
    Notes         text
);

CREATE UNIQUE INDEX IX_Locations_Code ON tblLocations (LocationCode);
CREATE INDEX IX_Locations_Type        ON tblLocations (LocationType);
CREATE INDEX IX_Locations_Zone        ON tblLocations (Zone);


-- 4.2 tblBatches (skeleton — unused until batch tracking activated)
CREATE TABLE tblBatches (
    BatchID            serial    PRIMARY KEY,
    BatchReference     varchar(100),
    ProductID          integer,
    SupplierID         integer,
    POID               integer,
    ReceivedDate       timestamptz,
    ExpiryDate         timestamptz,
    QuantityReceived   smallint  DEFAULT 0,
    QuantityRemaining  smallint  DEFAULT 0,
    Notes              text,
    IsActive           boolean   DEFAULT true
);

CREATE INDEX IX_Batches_ProductID ON tblBatches (ProductID);
CREATE INDEX IX_Batches_POID      ON tblBatches (POID);


-- 4.3 tblStockLevels
CREATE TABLE tblStockLevels (
    StockLevelID    serial        PRIMARY KEY,
    ProductID       integer       NOT NULL,
    LocationID      integer       NOT NULL,
    QuantityOnHand  smallint      DEFAULT 0,
    BagSize         smallint      DEFAULT 0,
    PickPriority    smallint      DEFAULT 0,
    LastCountDate   timestamptz,
    LastCountBy     varchar(100),
    BatchID         integer,
    Notes           varchar(255)
);

-- One record per product per location
CREATE UNIQUE INDEX IX_StockLevels_ProductLocation ON tblStockLevels (ProductID, LocationID);
CREATE INDEX IX_StockLevels_LocationID             ON tblStockLevels (LocationID);
CREATE INDEX IX_StockLevels_PickPriority           ON tblStockLevels (PickPriority);


-- 4.4 tblStockMovements
CREATE TABLE tblStockMovements (
    MovementID      serial        PRIMARY KEY,
    MovementDate    timestamptz,
    MovementType    varchar(50),
    ProductID       integer       NOT NULL,
    FromLocationID  integer,
    ToLocationID    integer,
    Quantity        smallint      DEFAULT 0,
    Reference       varchar(100),
    Reason          varchar(255),
    CreatedBy       varchar(100),
    BatchID         integer,
    Notes           text
);

CREATE INDEX IX_StockMovements_ProductID      ON tblStockMovements (ProductID);
CREATE INDEX IX_StockMovements_FromLocationID ON tblStockMovements (FromLocationID);
CREATE INDEX IX_StockMovements_ToLocationID   ON tblStockMovements (ToLocationID);
CREATE INDEX IX_StockMovements_MovementDate   ON tblStockMovements (MovementDate);
CREATE INDEX IX_StockMovements_MovementType   ON tblStockMovements (MovementType);


/* ================================================================
   SECTION 5 — CLIENT AND ORDER TABLES
================================================================ */

-- 5.1 tblClients
CREATE TABLE tblClients (
    ClientID             serial          PRIMARY KEY,
    ClientCode           varchar(50),
    CompanyName          varchar(255),
    FirstName            varchar(100),
    LastName             varchar(100),
    Email                varchar(255),
    Phone                varchar(50),
    Address1             varchar(255),
    Address2             varchar(255),
    Town                 varchar(100),
    County               varchar(100),
    Postcode             varchar(20),
    Country              varchar(100)    DEFAULT 'United Kingdom',
    Source               varchar(50),
    IsReducedWholesale   boolean         DEFAULT false,
    DefaultBlindShip     boolean         DEFAULT false,
    ClientLogoPath       varchar(255),
    IsActive             boolean         DEFAULT true,
    DateAdded            timestamptz,
    Notes                text
);

CREATE UNIQUE INDEX IX_Clients_Email       ON tblClients (Email);
CREATE UNIQUE INDEX IX_Clients_Code        ON tblClients (ClientCode);
CREATE INDEX IX_Clients_CompanyName        ON tblClients (CompanyName);
CREATE INDEX IX_Clients_Postcode           ON tblClients (Postcode);


-- 5.2 tblClientPricing
CREATE TABLE tblClientPricing (
    ClientPricingID  serial          PRIMARY KEY,
    ClientID         integer         NOT NULL,
    PricingType      varchar(50),
    ProductID        integer,
    CategoryID       integer,
    FixedPrice       numeric(10,2),
    DiscountPercent  double precision DEFAULT 0,
    IsActive         boolean         DEFAULT true,
    Notes            varchar(255)
);

CREATE INDEX IX_ClientPricing_ClientID   ON tblClientPricing (ClientID);
CREATE INDEX IX_ClientPricing_ProductID  ON tblClientPricing (ProductID);
CREATE INDEX IX_ClientPricing_CategoryID ON tblClientPricing (CategoryID);


-- 5.3 tblOrders
CREATE TABLE tblOrders (
    OrderID             serial          PRIMARY KEY,
    OrderNumber         varchar(50),
    ClientID            integer         NOT NULL,
    OrderDate           timestamptz,
    RequiredDate        timestamptz,
    OrderSource         varchar(50),
    ExternalOrderRef    varchar(100),
    Status              varchar(50)     DEFAULT 'New',
    IsBlindShip         boolean         DEFAULT false,
    ShipToName          varchar(255),
    ShipToAddress1      varchar(255),
    ShipToAddress2      varchar(255),
    ShipToTown          varchar(100),
    ShipToCounty        varchar(100),
    ShipToPostcode      varchar(20),
    ShipToCountry       varchar(100)    DEFAULT 'United Kingdom',
    ShippingMethod      varchar(100),
    TrackingNumber      varchar(100),
    DespatchDate        timestamptz,
    SubTotal            numeric(10,2)   DEFAULT 0,
    TotalVAT            numeric(10,2)   DEFAULT 0,
    ShippingCost        numeric(10,2)   DEFAULT 0,
    OrderTotal          numeric(10,2)   DEFAULT 0,
    OrderTotalIncVAT    numeric(10,2)   DEFAULT 0,
    Notes               text,
    CreatedBy           varchar(100)
);

CREATE UNIQUE INDEX IX_Orders_OrderNumber    ON tblOrders (OrderNumber);
CREATE INDEX IX_Orders_ClientID              ON tblOrders (ClientID);
CREATE INDEX IX_Orders_Status                ON tblOrders (Status);
CREATE INDEX IX_Orders_OrderDate             ON tblOrders (OrderDate);
CREATE INDEX IX_Orders_ExternalOrderRef      ON tblOrders (ExternalOrderRef);


-- 5.4 tblOrderLines
CREATE TABLE tblOrderLines (
    OrderLineID      serial          PRIMARY KEY,
    OrderID          integer         NOT NULL,
    ProductID        integer,
    BundleID         integer,
    BackOrderID      integer,
    SKU              varchar(50),
    ProductName      varchar(255),
    QuantityOrdered  smallint        DEFAULT 0,
    QuantityPicked   smallint        DEFAULT 0,
    UnitPrice        numeric(10,2)   DEFAULT 0,
    LineTotal        numeric(10,2)   DEFAULT 0,
    VATStatus        varchar(20)     DEFAULT 'Standard',
    VATRate          double precision DEFAULT 0,
    VATAmount        numeric(10,2)   DEFAULT 0,
    LineTotalIncVAT  numeric(10,2)   DEFAULT 0,
    Status           varchar(50)     DEFAULT 'Pending',
    Notes            varchar(255)
);

CREATE INDEX IX_OrderLines_OrderID   ON tblOrderLines (OrderID);
CREATE INDEX IX_OrderLines_ProductID ON tblOrderLines (ProductID);
CREATE INDEX IX_OrderLines_Status    ON tblOrderLines (Status);
CREATE INDEX IX_OrderLines_BundleID  ON tblOrderLines (BundleID);


/* ================================================================
   SECTION 6 — PURCHASE ORDER TABLES
================================================================ */

-- 6.1 tblPurchaseOrders
CREATE TABLE tblPurchaseOrders (
    POID             serial          PRIMARY KEY,
    PONumber         varchar(50),
    SupplierID       integer         NOT NULL,
    OrderDate        timestamptz,
    ExpectedDate     timestamptz,
    ReceivedDate     timestamptz,
    Status           varchar(50)     DEFAULT 'Draft',
    FulfilsOrderID   integer,
    IsDropshipPO     boolean         DEFAULT false,
    SubTotal         numeric(10,2)   DEFAULT 0,
    DeliveryCost     numeric(10,2)   DEFAULT 0,
    POTotal          numeric(10,2)   DEFAULT 0,
    Notes            text,
    CreatedBy        varchar(100)
);

CREATE UNIQUE INDEX IX_PurchaseOrders_PONumber       ON tblPurchaseOrders (PONumber);
CREATE INDEX IX_PurchaseOrders_SupplierID            ON tblPurchaseOrders (SupplierID);
CREATE INDEX IX_PurchaseOrders_Status                ON tblPurchaseOrders (Status);
CREATE INDEX IX_PurchaseOrders_FulfilsOrderID        ON tblPurchaseOrders (FulfilsOrderID);


-- 6.2 tblPurchaseOrderLines
CREATE TABLE tblPurchaseOrderLines (
    POLineID                serial          PRIMARY KEY,
    POID                    integer         NOT NULL,
    ProductID               integer         NOT NULL,
    QuantityOrdered         smallint        DEFAULT 0,
    QuantityReceived        smallint        DEFAULT 0,
    UnitCostUSD             numeric(10,2)   DEFAULT 0,
    UnitCost                numeric(10,2)   DEFAULT 0,
    LandedCostGBP           numeric(10,2)   DEFAULT 0,
    LandedCostCalculated    boolean         DEFAULT false,
    LineTotal               numeric(10,2)   DEFAULT 0,
    DeliverToLocationID     integer,
    Status                  varchar(50)     DEFAULT 'Pending'
);

CREATE INDEX IX_POLines_POID                ON tblPurchaseOrderLines (POID);
CREATE INDEX IX_POLines_ProductID           ON tblPurchaseOrderLines (ProductID);
CREATE INDEX IX_POLines_DeliverToLocationID ON tblPurchaseOrderLines (DeliverToLocationID);


-- 6.3 tblSupplierInvoices
CREATE TABLE tblSupplierInvoices (
    InvoiceID            serial          PRIMARY KEY,
    InvoiceNumber        varchar(100),
    POID                 integer         NOT NULL,
    SupplierID           integer         NOT NULL,
    InvoiceDate          timestamptz,
    ReceivedDate         timestamptz,
    ProductCostUSD       numeric(10,2)   DEFAULT 0,
    DeliveryCostUSD      numeric(10,2)   DEFAULT 0,
    ImportDutyGBP        numeric(10,2)   DEFAULT 0,
    ExchangeRate         double precision DEFAULT 1,
    ProductCostGBP       numeric(10,2)   DEFAULT 0,
    DeliveryCostGBP      numeric(10,2)   DEFAULT 0,
    TotalLandedCostGBP   numeric(10,2)   DEFAULT 0,
    Status               varchar(50)     DEFAULT 'Received',
    Notes                text,
    ProcessedBy          varchar(100),
    ProcessedDate        timestamptz
);

CREATE INDEX IX_SupplierInvoices_POID       ON tblSupplierInvoices (POID);
CREATE INDEX IX_SupplierInvoices_SupplierID ON tblSupplierInvoices (SupplierID);
CREATE INDEX IX_SupplierInvoices_Status     ON tblSupplierInvoices (Status);


/* ================================================================
   SECTION 7 — PICKING TABLES
================================================================ */

-- 7.1 tblPickingLists
CREATE TABLE tblPickingLists (
    PickingListID  serial        PRIMARY KEY,
    OrderID        integer       NOT NULL,
    GeneratedDate  timestamptz,
    GeneratedBy    varchar(100),
    Status         varchar(50)   DEFAULT 'Generated',
    Mode           varchar(20)   DEFAULT '1'
);

CREATE INDEX IX_PickingLists_OrderID ON tblPickingLists (OrderID);
CREATE INDEX IX_PickingLists_Status  ON tblPickingLists (Status);


-- 7.2 tblPickingListLines
CREATE TABLE tblPickingListLines (
    PickingLineID       serial        PRIMARY KEY,
    PickingListID       integer       NOT NULL,
    OrderLineID         integer       NOT NULL,
    ProductID           integer       NOT NULL,
    SKU                 varchar(50),
    ProductName         varchar(255),
    PickFromLocationID  integer,
    QuantityToPick      smallint      DEFAULT 0,
    MoveToPickingBin    smallint      DEFAULT 0,
    PickSequence        smallint      DEFAULT 0,
    Instruction         varchar(255),
    IsCompleted         boolean       DEFAULT false
);

CREATE INDEX IX_PickingListLines_PickingListID ON tblPickingListLines (PickingListID);
CREATE INDEX IX_PickingListLines_OrderLineID   ON tblPickingListLines (OrderLineID);
CREATE INDEX IX_PickingListLines_PickSequence  ON tblPickingListLines (PickSequence);
CREATE INDEX IX_PickingListLines_IsCompleted   ON tblPickingListLines (IsCompleted);


/* ================================================================
   SECTION 8 — QUOTE TABLES
================================================================ */

-- 8.1 tblQuotes
CREATE TABLE tblQuotes (
    QuoteID              serial          PRIMARY KEY,
    QuoteNumber          varchar(50),
    ClientID             integer         NOT NULL,
    QuoteDate            timestamptz,
    ValidUntil           timestamptz,
    Status               varchar(50)     DEFAULT 'Draft',
    ConvertedToOrderID   integer,
    SentDate             timestamptz,
    ResponseDate         timestamptz,
    SubTotal             numeric(10,2)   DEFAULT 0,
    Notes                text,
    CreatedBy            varchar(100)
);

CREATE UNIQUE INDEX IX_Quotes_QuoteNumber ON tblQuotes (QuoteNumber);
CREATE INDEX IX_Quotes_ClientID           ON tblQuotes (ClientID);
CREATE INDEX IX_Quotes_Status             ON tblQuotes (Status);
CREATE INDEX IX_Quotes_ValidUntil         ON tblQuotes (ValidUntil);


-- 8.2 tblQuoteLines
CREATE TABLE tblQuoteLines (
    QuoteLineID   serial          PRIMARY KEY,
    QuoteID       integer         NOT NULL,
    LineType      varchar(20)     DEFAULT 'Standard',
    ProductID     integer,
    CustomJobID   integer,
    Description   varchar(255),
    Quantity      smallint        DEFAULT 0,
    UnitPrice     numeric(10,2)   DEFAULT 0,
    LineTotal     numeric(10,2)   DEFAULT 0,
    Notes         varchar(255)
);

CREATE INDEX IX_QuoteLines_QuoteID   ON tblQuoteLines (QuoteID);
CREATE INDEX IX_QuoteLines_ProductID ON tblQuoteLines (ProductID);
CREATE INDEX IX_QuoteLines_LineType  ON tblQuoteLines (LineType);


/* ================================================================
   SECTION 9 — CUSTOM JOBS TABLES
================================================================ */

-- 9.1 tblCustomJobs
CREATE TABLE tblCustomJobs (
    CustomJobID              serial          PRIMARY KEY,
    JobReference             varchar(50),
    JobName                  varchar(255),
    ClientID                 integer         NOT NULL,
    OrderID                  integer,
    QuoteID                  integer,
    Status                   varchar(50)     DEFAULT 'Enquiry',
    JobSpec                  text,
    IsReorderableSpec        boolean         DEFAULT false,
    SpecCode                 varchar(50),
    SupplierID               integer,
    ArtworkRequired          boolean         DEFAULT false,
    ArtworkApprovedDate      timestamptz,
    ArtworkApprovedBy        varchar(100),
    ProductionStartDate      timestamptz,
    ExpectedCompletionDate   timestamptz,
    ActualCompletionDate     timestamptz,
    Quantity                 smallint        DEFAULT 0,
    QuotedPrice              numeric(10,2)   DEFAULT 0,
    FinalPrice               numeric(10,2)   DEFAULT 0,
    Notes                    text,
    CreatedBy                varchar(100),
    DateCreated              timestamptz
);

CREATE UNIQUE INDEX IX_CustomJobs_JobReference    ON tblCustomJobs (JobReference);
CREATE INDEX IX_CustomJobs_ClientID               ON tblCustomJobs (ClientID);
CREATE INDEX IX_CustomJobs_Status                 ON tblCustomJobs (Status);
CREATE INDEX IX_CustomJobs_SpecCode               ON tblCustomJobs (SpecCode);
CREATE INDEX IX_CustomJobs_IsReorderableSpec      ON tblCustomJobs (IsReorderableSpec);


-- 9.2 tblCustomJobCosts
CREATE TABLE tblCustomJobCosts (
    JobCostID          serial          PRIMARY KEY,
    CustomJobID        integer         NOT NULL,
    CostType           varchar(50),
    SupplierID         integer,
    Description        varchar(255),
    EstimatedCost      numeric(10,2)   DEFAULT 0,
    ActualCost         numeric(10,2)   DEFAULT 0,
    CostDate           timestamptz,
    InvoiceReference   varchar(100),
    Notes              varchar(255)
);

CREATE INDEX IX_CustomJobCosts_CustomJobID ON tblCustomJobCosts (CustomJobID);
CREATE INDEX IX_CustomJobCosts_CostType    ON tblCustomJobCosts (CostType);


/* ================================================================
   SECTION 10 — RETURNS TABLES
================================================================ */

-- 10.1 tblReturns
CREATE TABLE tblReturns (
    ReturnID           serial          PRIMARY KEY,
    ReturnReference    varchar(50),
    ReturnType         varchar(50),
    ReturnDate         timestamptz,
    ClientID           integer,
    SupplierID         integer,
    OriginalOrderID    integer,
    OriginalPOID       integer,
    Status             varchar(50)     DEFAULT 'Received',
    ReturnReason       varchar(255),
    CreditNoteRef      varchar(100),
    CreditAmount       numeric(10,2)   DEFAULT 0,
    Notes              text,
    ProcessedBy        varchar(100),
    DateCreated        timestamptz
);

CREATE UNIQUE INDEX IX_Returns_ReturnReference ON tblReturns (ReturnReference);
CREATE INDEX IX_Returns_ClientID               ON tblReturns (ClientID);
CREATE INDEX IX_Returns_SupplierID             ON tblReturns (SupplierID);
CREATE INDEX IX_Returns_OriginalOrderID        ON tblReturns (OriginalOrderID);
CREATE INDEX IX_Returns_Status                 ON tblReturns (Status);


-- 10.2 tblReturnLines
CREATE TABLE tblReturnLines (
    ReturnLineID        serial          PRIMARY KEY,
    ReturnID            integer         NOT NULL,
    ProductID           integer         NOT NULL,
    SKU                 varchar(50),
    QuantityReturned    smallint        DEFAULT 0,
    ReturnToLocationID  integer,
    UnitValue           numeric(10,2)   DEFAULT 0,
    LineValue           numeric(10,2)   DEFAULT 0,
    Notes               varchar(255)
);

CREATE INDEX IX_ReturnLines_ReturnID           ON tblReturnLines (ReturnID);
CREATE INDEX IX_ReturnLines_ProductID          ON tblReturnLines (ProductID);
CREATE INDEX IX_ReturnLines_ReturnToLocationID ON tblReturnLines (ReturnToLocationID);


/* ================================================================
   SECTION 11 — BUNDLE TABLES
================================================================ */

-- 11.1 tblBundles
CREATE TABLE tblBundles (
    BundleID     serial          PRIMARY KEY,
    BundleName   varchar(255)    NOT NULL,
    BundleCode   varchar(50),
    Description  text,
    SalesPrice   numeric(10,2)   DEFAULT 0,
    IsActive     boolean         DEFAULT true,
    Notes        varchar(255)
);

CREATE UNIQUE INDEX IX_Bundles_BundleCode ON tblBundles (BundleCode);
CREATE INDEX IX_Bundles_IsActive          ON tblBundles (IsActive);


-- 11.2 tblBundleComponents
CREATE TABLE tblBundleComponents (
    BundleComponentID  serial    PRIMARY KEY,
    BundleID           integer   NOT NULL,
    ProductID          integer   NOT NULL,
    Quantity           smallint  DEFAULT 1,
    Notes              varchar(255)
);

CREATE INDEX IX_BundleComponents_BundleID  ON tblBundleComponents (BundleID);
CREATE INDEX IX_BundleComponents_ProductID ON tblBundleComponents (ProductID);


/* ================================================================
   SECTION 12 — SKELETON TABLES
   Structure only — no UI or logic until features are activated.
================================================================ */

-- 12.1 tblBackOrders
CREATE TABLE tblBackOrders (
    BackOrderID             serial        PRIMARY KEY,
    OriginalOrderLineID     integer,
    ProductID               integer,
    ClientID                integer,
    QuantityOutstanding     smallint      DEFAULT 0,
    Status                  varchar(50)   DEFAULT 'Open',
    DateCreated             timestamptz,
    ExpectedFulfilmentDate  timestamptz,
    Notes                   varchar(255)
);

CREATE INDEX IX_BackOrders_ProductID           ON tblBackOrders (ProductID);
CREATE INDEX IX_BackOrders_ClientID            ON tblBackOrders (ClientID);
CREATE INDEX IX_BackOrders_OriginalOrderLineID ON tblBackOrders (OriginalOrderLineID);
CREATE INDEX IX_BackOrders_Status              ON tblBackOrders (Status);


/* ================================================================
   END OF SCRIPT

   All 28 tables created.

   Tables created:
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

   NEXT STEPS:
   1. Verify all 28 tables appear in Supabase Table Editor
   2. Check tblStockLevels has the composite unique index on
      ProductID + LocationID
   3. Confirm serial primary keys are generating correctly
   4. Begin Phase 2 — auth and user management
================================================================ */
