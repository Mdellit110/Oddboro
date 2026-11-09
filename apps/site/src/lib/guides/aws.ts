// The AWS guides: one for the sign-in every AWS tool shares, then one per
// tool (Secrets Manager, read only, builder). The AWS console's labels are
// AWS's own; the office's are quoted from AwsSignIn.svelte, AwsSecretPick.svelte
// and connectSteps in the ledger, and change with them. The policies follow
// the 2026-11-07 AWS ruling.
import type { Part, Step, Trouble } from './types.ts';

export const CONSOLE = 'https://console.aws.amazon.com';
export const IDENTITY_CENTER = `${CONSOLE}/singlesignon`;
const SECRETS_CONSOLE = `${CONSOLE}/secretsmanager`;
export const ENABLE_IDENTITY_CENTER =
  'https://docs.aws.amazon.com/singlesignon/latest/userguide/enable-identity-center.html';
export const UV_MAC_LINUX = 'curl -LsSf https://astral.sh/uv/install.sh | sh';
export const UV_WINDOWS =
  'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"';

export const GUIDES = {
  signIn: '/connectors/aws-sign-in/',
  secrets: '/connectors/aws-secrets/',
  read: '/connectors/aws-read/',
  build: '/connectors/aws-build/'
} as const;

/** The office's role: reads values for other tools' keys, and lists names for the Odds. */
const SECRETS_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:ListSecrets",
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}`;

/** Keeps values away from the Odds' roles, whatever else the role is given. */
const NO_VALUES_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:BatchGetSecretValue",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:GetParameterHistory"
      ],
      "Resource": "*"
    }
  ]
}`;

const openIdentityCenter: Step = {
  text: 'Open IAM Identity Center, signed in to the AWS console as an administrator.',
  link: IDENTITY_CENTER
};

/** Making one permission set: AWS's own policy if any, then ours inline. */
function permissionSet(name: string, inline: string, detail: string, managed?: string): Step[] {
  return [
    openIdentityCenter,
    {
      text: 'In the left menu, under Multi-account permissions, click Permission sets.',
      detail:
        'No Multi-account permissions in the menu? Turn it on first: the AWS sign-in guide shows how.'
    },
    { text: 'Click Create permission set.' },
    { text: 'Choose Custom permission set.' },
    { text: 'Click Next.' },
    ...(managed
      ? [
          { text: 'Expand AWS managed policies.' },
          { text: `Search for ${managed}.`, copy: managed },
          { text: `Tick ${managed}.` }
        ]
      : []),
    { text: 'Expand Inline policy.' },
    { text: 'Replace what is in the box with this policy.', detail, copy: inline },
    { text: 'Click Next.' },
    { text: 'For Permission set name, type this.', copy: name },
    { text: 'Click Next.' },
    { text: 'Click Create.' }
  ];
}

/** Giving the Oddboro user one permission set in the account. */
function assign(name: string): Part {
  return {
    title: 'Give it to the Oddboro user (in AWS)',
    steps: [
      { text: 'In the left menu, click AWS accounts.' },
      { text: 'Tick the account you want Oddboro in.' },
      { text: 'Click Assign users or groups.' },
      {
        text: 'On the Users tab, tick oddboro.',
        detail:
          'The user from the AWS sign-in guide. If you signed in to Oddboro as another user, tick that one: the role goes to whoever Oddboro signed in as.'
      },
      { text: 'Click Next.' },
      { text: `Tick ${name}.` },
      { text: 'Click Next.' },
      { text: 'Click Submit.', detail: 'Wait until the page says it is done.' }
    ]
  };
}

/** The office's one desk step for an AWS tool, sign-in included when it is not signed in yet. */
function desk(
  tool: string,
  roleLabel: string,
  name: string,
  regionLabel: string,
  button: string,
  done: string
): Part {
  return {
    title: 'Connect it from your desk (in Oddboro)',
    intro:
      'If the office is already signed in to AWS, for another AWS tool, the step skips straight to step 9.',
    steps: [
      { text: 'In Oddboro, click Desk.' },
      { text: `Open the task named Connect ${tool} for your Odd.` },
      { text: 'Paste your portal URL into AWS access portal URL.' },
      { text: 'Type your Identity Center Region into Identity Center Region.' },
      {
        text: 'Click Sign in.',
        detail: 'AWS’s page opens in a new tab with a code. The desk shows the same code.'
      },
      { text: 'On AWS’s page, check that the code matches.' },
      {
        text: 'Sign in as oddboro.',
        detail: 'Or as your own user, if AWS would not let you add one for Oddboro.'
      },
      {
        text: 'Allow Oddboro office access when AWS asks.',
        detail: 'Back on the desk, the role list appears.'
      },
      { text: `For “${roleLabel}”, pick ${name}.` },
      { text: `Type your Region into “${regionLabel}”.` },
      { text: `Click ${button}.`, detail: done }
    ]
  };
}

const findWorkRegion: Part = {
  title: 'Find the Region your work is in (in AWS)',
  steps: [
    { text: 'Open the AWS console.', link: CONSOLE },
    { text: 'Open a service you use, such as Lambda or EC2, and find your resources.' },
    {
      text: 'Click the Region menu at the top right, and note the Region it shows.',
      detail:
        'Note its code, such as us-east-2. Your Odds start there, and can reach other Regions by naming them.'
    }
  ]
};

// The sign-in every AWS tool shares

export const SIGN_IN_PARTS: Part[] = [
  {
    title: 'Find your sign-in details (in AWS)',
    steps: [
      openIdentityCenter,
      {
        text: 'Click Dashboard.',
        detail:
          'If you see Enable instead, Identity Center runs in another Region. Change the Region menu at the top right until the Dashboard shows.'
      },
      {
        text: 'Under AWS access portal URLs, copy the IPv4-only URL.',
        detail:
          'It goes in Oddboro’s “AWS access portal URL” box, which fills in the Region from it. An older account shows a single URL ending in /start instead: copy that one.',
        example: 'https://ssoins-xxxxxxxxxxxxxxxx.us-east-1.portal.amazonaws.com'
      },
      {
        text: 'Under Settings summary, note the Primary Region, such as us-east-1.',
        detail:
          'This is your Identity Center Region. If Oddboro did not fill it in from the URL, type it in Oddboro’s “Identity Center Region” box.'
      }
    ]
  },
  {
    title: 'Turn on multi-account permissions (in AWS)',
    intro:
      'Oddboro’s roles are permission sets, which newer AWS accounts start with turned off. If the left menu already shows Multi-account permissions, skip this part.',
    steps: [
      { text: 'In the left menu, click Settings.' },
      { text: 'Click the Management tab.' },
      {
        text: 'Under Multi-account permissions, click Enable.',
        detail:
          'If AWS asks you to confirm, confirm. Status changes to Enabled, and Multi-account permissions shows in the left menu.'
      }
    ]
  },
  {
    title: 'Make a user for Oddboro (in AWS)',
    intro:
      'Oddboro keeps this sign-in, so give it a user of its own that holds only the roles you make for Oddboro. If AWS will not let you add a user, skip this part and use your own: wherever a guide says oddboro, pick your own user instead.',
    steps: [
      { text: 'In the left menu, click Users.' },
      { text: 'Click Add user.' },
      { text: 'For Username, type this.', copy: 'oddboro' },
      { text: 'Keep “Send an email to this user with password setup instructions”.' },
      { text: 'Enter an email address you can read, and a first and last name.' },
      { text: 'Click Next.' },
      { text: 'Click Next again.', detail: 'Groups are not needed.' },
      { text: 'Click Add user.' },
      { text: 'Open the email titled “Invitation to join AWS IAM Identity Center”.' },
      { text: 'Click Accept invitation.' },
      {
        text: 'Set a password.',
        detail: 'If AWS asks you to register an MFA device, register one.'
      }
    ]
  }
];

const signInTrouble: Trouble[] = [
  {
    q: '“Your AWS user has no roles yet.”',
    a: 'The oddboro user has no permission set in that account yet. Do the “Give it to the Oddboro user” part, wait a minute, then click Look again.'
  },
  {
    q: 'AWS asks me to sign in again every day.',
    a: 'Identity Center ends a sign-in after 8 hours unless you change it. In IAM Identity Center, click Settings, then the Authentication tab, then Configure next to Session duration. It goes up to 90 days.'
  }
];

export const SIGN_IN_TROUBLE: Trouble[] = [
  {
    q: 'AWS says I am not authorized to perform sso:CreateInstance.',
    a: 'Your account belongs to an AWS organization, and its IAM Identity Center lives in the organization’s management account. Switch to the management account in the account menu at the top right, and do the AWS parts there. Oddboro reaches your other accounts, such as a project’s, through it.'
  },
  {
    q: 'AWS will not let me add an oddboro user.',
    a: 'Some accounts, such as one whose Identity Center uses AWS Builder ID, cannot add users. Use your own user instead: give each role to yourself in the “Give it to the Oddboro user” part, and sign in to Oddboro as yourself. Oddboro then lists every role your user has, and each tool uses only the one you pick for it.'
  },
  {
    q: 'I see Enable on every Region’s Dashboard.',
    a: 'IAM Identity Center is not on yet for this account. AWS’s guide to enabling it is linked under Before you start.'
  },
  ...signInTrouble
];

// AWS Secrets Manager

export const SECRETS_PARTS: Part[] = [
  {
    title: 'Make the office’s role (in AWS)',
    intro:
      'The office uses this role to list your secrets’ names for your Odds, and to read a value only when another tool needs its key.',
    steps: permissionSet(
      'OddboroSecrets',
      SECRETS_POLICY,
      'It reaches every secret. To keep some out of reach, change "*" to the secrets you want, such as arn:aws:secretsmanager:*:*:secret:oddboro/*.'
    )
  },
  assign('OddboroSecrets'),
  {
    title: 'Find the Region your secrets are in (in AWS)',
    steps: [
      {
        text: 'Open Secrets Manager.',
        detail:
          'Switch to the account your secrets are in first, such as your project’s account, not the management account.',
        link: SECRETS_CONSOLE
      },
      {
        text: 'Click one of your secrets.',
        detail: 'If the list is empty, change the Region menu at the top right until you see them.'
      },
      {
        text: 'Find its Secret ARN, and note the Region in it.',
        detail: 'The Region is the part after secretsmanager:, here us-east-2.',
        example: 'arn:aws:secretsmanager:us-east-2:123456789012:secret:prod/stripe'
      }
    ]
  },
  desk(
    'AWS Secrets Manager',
    'The role the office reads your secrets with',
    'OddboroSecrets',
    'Region your secrets are in',
    'Connect',
    'The step ticks. Your Odds can list your secrets’ names, and other tools’ key steps offer “Use a secret from AWS instead”.'
  )
];

export const SECRETS_TROUBLE: Trouble[] = [
  ...signInTrouble,
  {
    q: 'A key from AWS fails with AccessDenied, mentioning KMS.',
    a: 'That secret is encrypted with a KMS key of your own. Add kms:Decrypt on that key to the OddboroSecrets permission set.'
  }
];

// AWS, read only and builder

const VALUE_CHECK =
  'The office tries to read one secret as this role. When AWS refuses, the step ticks and the office starts AWS’s tool. The first time takes a minute or so.';

export const READ_PARTS: Part[] = [
  {
    title: 'Make the read-only role (in AWS)',
    intro:
      'Your Odds use this role. It is AWS’s own read-only access, with a Deny that keeps secret values out of reach.',
    steps: permissionSet(
      'OddboroRead',
      NO_VALUES_POLICY,
      'The Deny wins over anything else the role is given, so Odds never read a value from Secrets Manager or Parameter Store.',
      'ReadOnlyAccess'
    )
  },
  assign('OddboroRead'),
  findWorkRegion,
  desk(
    'AWS, read only',
    'The role your Odds read AWS with',
    'OddboroRead',
    'Region your work is in',
    'Check and connect',
    VALUE_CHECK
  )
];

export const BUILD_PARTS: Part[] = [
  {
    title: 'Make the builder role (in AWS)',
    intro:
      'Your Odds use this role. It is AWS’s own power-user access, which leaves out IAM, with a Deny that keeps secret values out of reach.',
    steps: permissionSet(
      'OddboroBuild',
      NO_VALUES_POLICY,
      'The Deny wins over anything else the role is given, so Odds never read a value from Secrets Manager or Parameter Store.',
      'PowerUserAccess'
    )
  },
  assign('OddboroBuild'),
  findWorkRegion,
  desk(
    'AWS, builder',
    'The role your Odds build in AWS with',
    'OddboroBuild',
    'Region your work is in',
    'Check and connect',
    VALUE_CHECK
  )
];

const toolTrouble: Trouble[] = [
  ...signInTrouble,
  {
    q: '“That role can read secret values, and Odds must never see one.”',
    a: 'The role is missing the Deny. Check its inline policy against the one above, then click Check and connect again.'
  },
  {
    q: '“There are no secrets yet, so the office could not test …”',
    a: 'The office connected without testing the role. Store one secret in Secrets Manager, click Undo on the step, then Check and connect again.'
  },
  {
    q: '“Oddboro starts AWS’s tool with uv, and this computer does not have it.”',
    a: 'Install uv (Before you start), then click Check and connect again.'
  }
];

export const READ_TROUBLE: Trouble[] = toolTrouble;

export const BUILD_TROUBLE: Trouble[] = [
  ...toolTrouble,
  {
    q: 'A deploy fails while creating an IAM role.',
    a: 'Builder cannot change IAM, so an Odd cannot make or change roles. Create the role yourself, then tell the Odd its name.'
  }
];
