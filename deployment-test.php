DEPLOYMENT TEST - <?php echo date('Y-m-d H:i:s'); ?>

This file confirms GitHub Actions deployment is working.
If you can see this at: https://marriageducation.com/deployment-test.php
Then the deployment path is correct.

Test Time: <?php echo date('Y-m-d H:i:s'); ?>
Server: <?php echo $_SERVER['HTTP_HOST'] ?? 'Unknown'; ?>
Path: <?php echo __FILE__; ?>