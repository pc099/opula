const { AWSIntegration } = require('./dist/integrations/aws/awsIntegration');

async function testAWSConnection() {
  console.log('🔍 Testing AWS Connection...\n');

  try {
    // Load environment variables
    require('dotenv').config();

    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
      profile: process.env.AWS_PROFILE
    };

    console.log('📋 Configuration:');
    console.log(`   Region: ${credentials.region}`);
    console.log(`   Access Key: ${credentials.accessKeyId ? credentials.accessKeyId.substring(0, 8) + '...' : 'Not set'}`);
    console.log(`   Secret Key: ${credentials.secretAccessKey ? '***configured***' : 'Not set'}`);
    console.log(`   Profile: ${credentials.profile || 'Not set'}\n`);

    if (!credentials.accessKeyId && !credentials.profile) {
      console.log('❌ No AWS credentials configured!');
      console.log('\n💡 To configure AWS credentials, add to your .env file:');
      console.log('   AWS_ACCESS_KEY_ID=your-access-key');
      console.log('   AWS_SECRET_ACCESS_KEY=your-secret-key');
      console.log('   AWS_DEFAULT_REGION=us-east-1');
      console.log('\n   OR use AWS Profile:');
      console.log('   AWS_PROFILE=your-profile-name');
      return;
    }

    const aws = new AWSIntegration(credentials);

    console.log('🔗 Testing AWS connection...');
    const startTime = Date.now();
    const isConnected = await aws.testConnection();
    const responseTime = Date.now() - startTime;

    if (isConnected) {
      console.log(`✅ AWS connection successful! (${responseTime}ms)\n`);
      
      console.log('🚀 Testing AWS services...');
      
      try {
        console.log('   📊 Fetching EC2 instances...');
        const instances = await aws.getEC2Instances();
        console.log(`   ✅ Found ${instances.length} EC2 instances`);
      } catch (error) {
        console.log(`   ⚠️  EC2 access limited: ${error.message}`);
      }

      try {
        console.log('   🐳 Fetching ECS services...');
        const services = await aws.getECSServices();
        console.log(`   ✅ Found ${services.length} ECS services`);
      } catch (error) {
        console.log(`   ⚠️  ECS access limited: ${error.message}`);
      }

      try {
        console.log('   ⚡ Fetching Lambda functions...');
        const functions = await aws.getLambdaFunctions();
        console.log(`   ✅ Found ${functions.length} Lambda functions`);
      } catch (error) {
        console.log(`   ⚠️  Lambda access limited: ${error.message}`);
      }

      try {
        console.log('   💰 Fetching cost data...');
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const costData = await aws.getCostAndUsage(startDate, endDate);
        console.log(`   ✅ Found cost data for ${costData.length} services`);
      } catch (error) {
        console.log(`   ⚠️  Cost Explorer access limited: ${error.message}`);
      }

      console.log('\n🎉 AWS integration is working!');
      console.log('\n📍 Next steps:');
      console.log('   1. Start the backend: npm run dev');
      console.log('   2. Check health endpoint: http://localhost:3002/health/detailed');
      console.log('   3. Test AWS endpoint: http://localhost:3002/api/aws/test-connection');

    } else {
      console.log(`❌ AWS connection failed! (${responseTime}ms)`);
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Verify your AWS credentials are correct');
      console.log('   2. Check your internet connection');
      console.log('   3. Ensure your AWS account has the necessary permissions');
      console.log('   4. Try a different AWS region');
    }

  } catch (error) {
    console.log(`❌ Error testing AWS connection: ${error.message}`);
    console.log('\n🔧 Common issues:');
    console.log('   - Invalid AWS credentials');
    console.log('   - Network connectivity issues');
    console.log('   - Insufficient IAM permissions');
    console.log('   - Incorrect AWS region');
  }
}

// Run the test
testAWSConnection().catch(console.error);