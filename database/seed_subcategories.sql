/* ================================================================
   PickFlow — Subcategory Seed Data
   Placeholder values — replace with real subcategories later.
   Run in Supabase SQL Editor.
   
   Requires tblcategories to already have data.
================================================================ */

-- Packaging subcategories
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Packaging'),
    'Boxes'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Packaging'),
    'Bags'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Packaging'),
    'Tape & Sealing'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Packaging'),
    'Void Fill'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Packaging'),
    'Labels'
);

-- Stationery subcategories
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Stationery'),
    'Paper'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Stationery'),
    'Envelopes'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Stationery'),
    'Pens & Markers'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Stationery'),
    'Files & Folders'
);

-- Wholesale Goods subcategories
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Wholesale Goods'),
    'Batch A'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Wholesale Goods'),
    'Batch B'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Wholesale Goods'),
    'Batch C'
);

-- Print Consumables subcategories
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Print Consumables'),
    'Ink & Toner'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Print Consumables'),
    'Ribbon'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Print Consumables'),
    'Drum & Imaging'
);
INSERT INTO tblsubcategories (categoryid, subcategoryname)
VALUES (
    (SELECT categoryid FROM tblcategories WHERE categoryname = 'Print Consumables'),
    'Media & Stock'
);
