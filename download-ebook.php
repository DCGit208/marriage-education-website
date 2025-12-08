<?php
// Download eBook Handler
$product_id = $_GET['product_id'] ?? '';

if (empty($product_id)) {
    http_response_code(400);
    die('Product ID required');
}

// Product to filename mapping
$products = [
    'sbd-founding' => 'Save_Before_Divorce_Founding_Edition.pdf',
    'sbd-regular' => 'Save_Before_Divorce.pdf'
];

if (!isset($products[$product_id])) {
    http_response_code(404);
    die('Product not found');
}

$filename = $products[$product_id];
$filepath = __DIR__ . '/ebooks/' . $filename;

if (!file_exists($filepath)) {
    http_response_code(404);
    die('File not found');
}

// Force download
header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($filepath));
header('Cache-Control: no-cache, must-revalidate');
header('Pragma: public');

readfile($filepath);
exit;
?>
