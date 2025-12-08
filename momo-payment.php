<?php
// MTN MOMO Payment Handler (PHP version - runs on shared hosting)
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// MTN MOMO Configuration
$MTN_MOMO_PRIMARY_KEY = '4455fd39957b48e281efde9612b55530';
$MTN_MOMO_API_USER = 'a26c84f3-d4b6-4d7d-b695-2a4a6078bed5';
$MTN_MOMO_API_KEY = 'ddf8f48d32cf4d5f90a1e401540ed143';
$MTN_MOMO_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
$MTN_MOMO_ENVIRONMENT = 'sandbox';

// Token cache file
$token_cache_file = __DIR__ . '/.momo_token_cache.json';

// Get OAuth2 Token
function get_momo_token() {
    global $MTN_MOMO_PRIMARY_KEY, $MTN_MOMO_API_USER, $MTN_MOMO_API_KEY, $MTN_MOMO_BASE_URL, $token_cache_file;
    
    // Check cache
    if (file_exists($token_cache_file)) {
        $cache = json_decode(file_get_contents($token_cache_file), true);
        if ($cache && time() < $cache['expiry']) {
            error_log("Using cached MOMO token");
            return $cache['token'];
        }
    }
    
    // Get new token
    $url = "$MTN_MOMO_BASE_URL/collection/token/";
    $auth = base64_encode("$MTN_MOMO_API_USER:$MTN_MOMO_API_KEY");
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Basic $auth",
        "Ocp-Apim-Subscription-Key: $MTN_MOMO_PRIMARY_KEY"
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code === 200) {
        $data = json_decode($response, true);
        $token = $data['access_token'];
        
        // Cache token (expires in 1 hour)
        $cache = [
            'token' => $token,
            'expiry' => time() + 3600
        ];
        file_put_contents($token_cache_file, json_encode($cache));
        
        error_log("✅ New MOMO token obtained");
        return $token;
    }
    
    error_log("❌ Failed to get MOMO token: HTTP $http_code");
    return null;
}

// Create Payment Request
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strpos($_SERVER['REQUEST_URI'], '/create-momo-payment') !== false) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $product_id = $input['product_id'] ?? '';
    $phone_number = $input['phone_number'] ?? '';
    $amount = $input['price'] ?? '';
    $currency = 'EUR'; // Sandbox uses EUR
    
    // Validate
    if (empty($phone_number) || empty($amount)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        exit;
    }
    
    // Normalize phone number
    $phone_number = preg_replace('/[^0-9]/', '', $phone_number);
    if (!preg_match('/^237[0-9]{9}$/', $phone_number)) {
        $phone_number = '237' . $phone_number;
    }
    
    // Get token
    $token = get_momo_token();
    if (!$token) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to authenticate with MOMO']);
        exit;
    }
    
    // Create payment request
    $reference_id = uniqid('momo_', true);
    $url = "$MTN_MOMO_BASE_URL/collection/v1_0/requesttopay";
    
    $payload = [
        'amount' => (string)$amount,
        'currency' => $currency,
        'externalId' => $product_id,
        'payer' => [
            'partyIdType' => 'MSISDN',
            'partyId' => $phone_number
        ],
        'payerMessage' => 'Payment for ' . $product_id,
        'payeeNote' => 'Marriage Education eBook purchase'
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $token",
        "X-Reference-Id: $reference_id",
        "X-Target-Environment: $MTN_MOMO_ENVIRONMENT",
        "Ocp-Apim-Subscription-Key: $MTN_MOMO_PRIMARY_KEY",
        "Content-Type: application/json"
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code === 202) {
        echo json_encode([
            'success' => true,
            'reference_id' => $reference_id,
            'message' => 'Payment request sent'
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Payment request failed', 'code' => $http_code]);
    }
    exit;
}

// Check Payment Status
if ($_SERVER['REQUEST_METHOD'] === 'GET' && strpos($_SERVER['REQUEST_URI'], '/momo-payment-status') !== false) {
    $reference_id = $_GET['reference_id'] ?? '';
    
    if (empty($reference_id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing reference_id']);
        exit;
    }
    
    $token = get_momo_token();
    if (!$token) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to authenticate']);
        exit;
    }
    
    $url = "$MTN_MOMO_BASE_URL/collection/v1_0/requesttopay/$reference_id";
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $token",
        "X-Target-Environment: $MTN_MOMO_ENVIRONMENT",
        "Ocp-Apim-Subscription-Key: $MTN_MOMO_PRIMARY_KEY"
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code === 200) {
        $data = json_decode($response, true);
        echo json_encode([
            'success' => true,
            'status' => $data['status'],
            'reason' => $data['reason'] ?? null
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'status' => 'PENDING'
        ]);
    }
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Endpoint not found']);
?>
