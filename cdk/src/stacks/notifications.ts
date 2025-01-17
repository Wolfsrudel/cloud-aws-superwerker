import path from 'path';
import * as pythonLambda from '@aws-cdk/aws-lambda-python-alpha';
import { NestedStack, NestedStackProps, aws_events as events, aws_iam as iam, aws_lambda as lambda, aws_sns as sns, aws_sns_subscriptions as subscriptions, CfnOutput, CfnParameter } from 'aws-cdk-lib';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class NotificationsStack extends NestedStack {
  constructor(scope: Construct, id: string, props: NestedStackProps) {
    super(scope, id, props);

    const notificationsMail = new CfnParameter(this, 'NotificationsMail', {
      type: 'String',
    });

    // NotificationTopic
    const notificationTopic = new sns.Topic(this, 'NotificationTopic');
    notificationTopic.addSubscription(new subscriptions.EmailSubscription(notificationsMail.valueAsString));
    (notificationTopic.node.defaultChild as sns.CfnTopic).overrideLogicalId('NotificationTopic');

    // NotificationOpsItemCreated
    const notificationOpsItemCreatedFn = new pythonLambda.PythonFunction(this, 'NotificationOpsItemCreated', {
      entry: path.join(__dirname, '..', 'functions', 'notification_opsItem_created'),
      handler: 'handler',
      runtime: lambda.Runtime.PYTHON_3_9,
      environment: {
        TOPIC_ARN: notificationTopic.topicArn,
      },
    });
    (notificationOpsItemCreatedFn.node.defaultChild as lambda.CfnFunction).overrideLogicalId('NotificationOpsItemCreated');

    const snsPublishMessagePolicy = new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [notificationTopic.topicArn],
      effect: iam.Effect.ALLOW,
    });

    notificationOpsItemCreatedFn.role?.attachInlinePolicy(
      new iam.Policy(this, 'NotificationOpsItemCreatedPolicy', {
        statements: [snsPublishMessagePolicy],
      }),
    );

    const notificationOpsItemCreatedRule = new events.Rule(this, 'NotificationOpsItemCreatedRule', {
      eventPattern: {
        source: ['aws.ssm'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventName: events.Match.exactString('CreateOpsItem'),
          eventSource: events.Match.exactString('ssm.amazonaws.com'),
        },
      },
    });

    notificationOpsItemCreatedRule.addTarget(new LambdaFunction(notificationOpsItemCreatedFn));

    new CfnOutput(this, 'NotificationTopicArn', {
      description: 'Notification topic ARN for ops center creation events',
      value: notificationTopic.topicArn,
    });
  }
}
