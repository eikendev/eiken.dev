---
title: "Cracking With Hashcat in the Cloud"
date: 2022-03-16T21:00:00Z
tags: ["aws", "cloud", "cracking", "hashcat"]
images: ["/img/blog/cracking-with-hashcat-in-the-cloud/card.png"]
---

Thanks to the global chip shortage, for about two years certain electronic items are really hard to buy.
This includes graphics cards, those things that make your display useful.
They're also beasts at cracking password hashes.
Admittedly, I waited for the situation to resolve so I can buy a graphics card for a sane price and improve my [hashcat](https://hashcat.net/hashcat/) experience, but I now think this is unlikely to happen anytime soon.
Time to find a modern solution.

## Cloud to the Rescue

hashcat is an incredibly powerful piece of software when used on the right hardware.
Sadly, my graphics card is too old to be supported by the latest driver, so I find myself resorting to [john](https://www.openwall.com/john/) every time I want to crack a hash.
This comes with the drawback of forcing a high load on my system, leaving me unable to work in parallel.
What can I do?
Buy a new graphics card for my system?
Build a dedicated cracking system?
Both options are unfavorable in the current market situation.
So I came up with this idea to use cloud computing.[^idea]

Okay, let me guess what you're thinking: this guy just throws the word "cloud" at his problem and we're done?
Well, maybe, but that's not the whole story.
The closer I got to a solution, the more advantages I discovered of using the cloud for this:
- I do not need to care about the maintenance of the hardware.
- There are times when I'm busy and don't use hashcat for a while or so. During these breaks, the bought card would lose value without serving any purpose.
- The cloud scales better than a local hardware setup. Need better performance _this_ time? Simply spawn a more powerful machine in the cloud.

Here is the game plan:
Cloud services like [AWS](https://aws.amazon.com/), [Azure](https://azure.microsoft.com/), and [GCP](https://cloud.google.com/) offer systems that come equipped with strong graphics cards.
They have the correct drivers pre-installed, just as if they were made for GPU-heavy computations.
I want to use this hardware and make it as easy as possible to access a high-performance hashcat installation.
In this post, I'll show you my results and how you can benefit from the project.
If you want to skip this post and start cracking, check the final code in my [GitHub repository](https://github.com/eikendev/cloud-cracking).

And as always, this may read as if I knew what I was doing, but I'm myself new to the topic.
Makes it more fun for everyone, _right_?

## Preparation Work

The first thing to do is to define the scope:
- The system should be accessible from the Internet, so I can use it even when I'm traveling with my laptop.
- I want to be able to spin up a system in minimum time, and only spend money when actually cracking.
- Since we have good hardware, let's try to get as much out of it as possible.
- Being careless with resources in the cloud can result in significant bills. Safeguards *are* necessary.

Ideally, the end product should tick all of these boxes.

Before we can do anything on the technical side, we must pick a cloud service provider.
I'll go with AWS here because a brief look revealed it's the cheapest option.[^provider]

So we'll need an AWS account.
If you don't already have one, simply go and create a root account on AWS.
The instances we spawn are not free, so make sure to provide valid payment details.[^budgets]

It is good practice to [create a separate IAM role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create.html) for our purposes.
This allows us to limit the permissions and access to our resources.
I'll call the user `cracking` and assign it the following permissions:[^permissions]
* `AmazonEC2FullAccess`
* `AmazonVPCFullAccess`
* `AWSCloudFormationFullAccess`

Next, download the [AWS command-line tool](https://aws.amazon.com/cli/), which is a great helper to automate light tasks.
I'm using v1 here because Fedora ships it by default.
After installing, run `aws configure` and use the IAM role to login.
Also, specify the default region where you want to create your hashcat instance.

To access the instances we spawn, we use SSH, so we need to [create a key pair](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html#having-ec2-create-your-key-pair) on AWS.
Remember the name you assign this key.
You can also import a key pair that's already been created locally.
Watch out for trailing newlines in the imported key, AWS seemed not to like these when I last tried.

One step is missing: our quota.
Basically, when we request a machine on AWS, we can select from a range of [different instance types](https://aws.amazon.com/ec2/instance-types/) which are grouped based on their purpose.
One of the groups is the "P Instances" group; these are meant for GPU-intensive tasks, so it's the group we use here.
Unfortunately, at the time of writing, AWS won't allow us to spawn any P instances by default.
We, therefore, need to [request a quota increase](https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html) for P instances.
I'll request a quota of 4 under "All P Spot Instance Requests" and "Running On-Demand P instances".[^quotas]

The value of GPUs naturally drives demand for GPUs in the cloud.
So it might be if you have not yet increased your quotas, that AWS denies your request.
Here's a reply I received regarding my limit increase request for "All P Spot Instance Requests" in Northern Virginia:

> Hi there,
>
> Thank you for your patience while we were awaiting feedback from the Service team.
>
> The Service team has advised that at this time, we are unable to approve your increase request. Due to the recent unprecedented demand for GPU instances, quota increases for GPU instances are now facilitated by our AWS sales teams. Please reach out to your Account team or contact AWS sales with a detailed description of your use-case and GPU requirements: https://aws.amazon.com/contact-us/sales-support/
>
> [...]

If you receive this, try to select another region.
While doing so keep in mind that not all regions support P instances.

## Hashcat Instance as Code

We can now go and launch instances.
But clicking through the web interface doesn't do for me.
Much better is to have a clean, repeatable way: [CloudFormation](https://aws.amazon.com/cloudformation/).
Using CloudFormation we can define our instance in a YAML file, called "template".
This lets us spawn our hashcat machine with a single command.

There are [better resources](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-anatomy.html) to learn how to create templates.
But on a very basic level, the format knows several high-level YAML keys like `Parameters`, `Mappings`, `Resources`, and `Outputs`.
The core of the file is in `Resources`: here we define what is actually being created with our template, the other keys give additional information and functionality.
When AWS reads our template and instantiates the resources, they are grouped in a so-called "stack".

### Parameters

Let's start with the parameters.
These let us supply user-specific information during creation and reference them in other parts of the file.
```yaml
Parameters:
  paramKeyPair:
    Description: The key pair for connecting via SSH
    Type: AWS::EC2::KeyPair::KeyName
  paramInstanceType:
    Description: The EC2 instance type
    Type: String
    Default: p2.xlarge
    AllowedValues:
      - p2.xlarge
      - p2.8xlarge
      - p2.16xlarge
```
We have two parameters: `paramKeyPair` and `paramInstanceType`.
The descriptions in the snippet indicate what each does.
Upon creation, these parameters are supplied, so they can be referenced in the rest of the template.

One comment regarding `paramInstanceType`: it is limited to the variants of P2 instances using the `AllowedValues` modifier.
There are also P3 (and P4) instances, which are newer, but more expensive.
They are also overkill depending on your use case.

### Mappings

To make sure we have the correct driver pre-installed on the box, we tell AWS to use the `AWS Deep Learning Base AMI` image.
We do this by providing an ID for the image but turns out the ID is region-specific.
To support multiple regions, we create a map that contains the correct image ID for many regions.
```yaml
Mappings:
  RegionMap:
    us-east-1:
      ami: ami-0365f1c02d110fa96
    us-west-2:
      ami: ami-01242c3178ffa1b87
    us-west-1:
      ami: ami-08ce7082680a0d51d
    eu-west-1:
      ami: ami-0e13b805a2eba9cbb
```
This way, we can later look up the ID for the region we create the instance in.

One thing to note here is that looking up the IDs can be a bit cumbersome.
I wrote a little script to automate this for many regions:
```bash
print_id () {
	local region
	region="$1"
	id="$(aws ec2 describe-images --region $region --owners amazon --filters 'Name=name,Values=AWS Deep Learning Base AMI (Ubuntu 18.04)*' | jq -r '.Images[0].ImageId')"
	printf "%s: %s\n" "$region" "$id"
}

while read -r region; do
	print_id "$region"
done <./regions.txt
```
The `regions.txt` file contains the regions to look up the IDs for, line by line.
Feel free to repurpose that for your own template.
Alternatively, you can get fancy and use a Lambda function, but this here works fine for me.

### Outputs

After creating the instance, we will want to connect to it over SSH.
This will require knowledge of the IP address associated with the instance.
To look it up conveniently, we write the IP address as an output of the CloudFormation template:
```yaml
Outputs:
  PublicIp:
    Description: The public IPv4 address of the hashcat instance
    Value: !GetAtt hashcatInstance.PublicIp
```

Note that we do not directly provide a value.
Instead, we use the `!GetAtt` function to instruct AWS to read the value from the `hashcatInstance` resource.
Think of this as a reference to a property of a resource we specify in the next section.

When we later query information about our stack, we will get back the IP as an output in JSON:
```json
"Outputs": [
    {
        "OutputKey": "PublicIp",
        "OutputValue": "3.86.125.30",
        "Description": "The public IPv4 address of the hashcat instance"
    }
]
```

### Resources

Now it's time for the core piece.
Let's try to make this as generic as possible and compatible with most environments.
Here is what I propose:
```yaml
Resources:
  # [...]
  hashcatSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupName: Security Group to allow access to the hashcat instance
      GroupDescription: Allows inbound SSH traffic from any source
      SecurityGroupIngress:
      - IpProtocol: tcp
        FromPort: 22
        ToPort: 22
        CidrIp: 0.0.0.0/0
      - IpProtocol: tcp
        FromPort: 22
        ToPort: 22
        CidrIpv6: '::/0'
      VpcId: !Ref hashcatVPC
  hashcatLaunchTemplate:
    Type: AWS::EC2::LaunchTemplate
    Properties:
      LaunchTemplateData:
        InstanceType: !Ref paramInstanceType
        KeyName: !Ref paramKeyPair
        ImageId: !FindInMap
          - RegionMap
          - !Ref 'AWS::Region'
          - ami
        InstanceMarketOptions:
            MarketType: spot
            SpotOptions:
              InstanceInterruptionBehavior: terminate
              MaxPrice: 0.4
              SpotInstanceType: one-time
        NetworkInterfaces:
          - AssociatePublicIpAddress: true
            DeleteOnTermination: true
            DeviceIndex: 0
            SubnetId: !Ref hashcatSubnet
            Groups:
              - !Ref hashcatSecurityGroup
        UserData:
          Fn::Base64: !Sub |
            #cloud-config
            repo_update: true
            packages:
              - build-essential
            runcmd:
              - touch /tmp/.cloudinit_started
              - systemctl disable --now unattended-upgrades
              - curl -sLo /tmp/rockyou.tgz 'https://github.com/danielmiessler/SecLists/raw/master/Passwords/Leaked-Databases/rockyou.txt.tar.gz'
              - tar -xf /tmp/rockyou.tgz -C /opt && rm -f /tmp/rockyou.tgz
              - curl -sLo /tmp/hashcat.tgz "$(curl -s https://api.github.com/repos/hashcat/hashcat/releases/latest | grep 'tarball_url' | awk '{print $2}' | tail -c +2 | head -c -3)"
              - tar -xf /tmp/hashcat.tgz -C /opt && rm -f /tmp/hashcat.tgz
              - cd /opt/hashcat-* && make -j4 && make install
              - shutdown -P +1440
              - touch /tmp/.cloudinit_completed
  hashcatInstance:
    Type: AWS::EC2::Instance
    DependsOn: hashcatRoute
    Properties:
      LaunchTemplate:
        LaunchTemplateId: !Ref hashcatLaunchTemplate
        Version: !GetAtt hashcatLaunchTemplate.LatestVersionNumber
```

Yeah, I admit, that's a bit to digest.
Let me break it down for you, bottom to top.

The `hashcatInstance` is the actual Instance.
This is what it's all about in the end.
There isn't much to its configuration, except that it uses our `hashcatLaunchTemplate`.

The `hashcatLaunchTemplate` is the recipe for AWS to create our Instance.
Here we specify the type from the parameters, together with the key pair for SSH.
We also specify the ID of the image that we defined in the `RegionMap`.
Look how `!FindInMap` is used to retrieve the value from the map.

An important key is `InstanceMarketOptions`.
This option says that we want a spot instance, not an on-demand one.
I haven't said this in the beginning, but the former is cheaper albeit not always available, whereas the latter is more expensive but usually available.
Also, a spot instance can suddenly terminate if other users are willing to pay more for it than you, so it's more "market-driven" than the on-demand instances with a fixed price.
If we left this key away we would request an on-demand instance, which might be suitable in some situations.

A `MaxPrice` of 0.4 seemed reasonable when I last checked all the prices in different regions.
We don't want to set this too high, else our instance might be eaten by other bidders too fast.
If every dime counts for you, adjust this with your target regions in mind.

The `NetworkInterfaces` is related to networking.
It puts the instance in the correct Subnet and assigns it the right SecurityGroup.
We'll come to this in a second.

One of the most important elements in this resource is the `UserData` key.
This lets us provide commands that we want the instance to run right after boot.
We can use this to install additional software and configure the system.

On AWS, we can do this through [cloud-init](https://cloud-init.io/), which describes itself as a "standard for customising cloud instances".
I would myself describe it like an [Ansible](https://www.ansible.com/) for machines in the cloud, with a more lightweight configuration.

Here are the high-level steps we perform in the configuration above:
* Before running custom commands, we list the `build-essential` package to be installed. It contains common tools for building software, including [Make](https://www.gnu.org/software/make/).
* We then download the rockyou password list, which is my go-to list for challenges on [Hack The Box](https://www.hackthebox.com/), and extract it to `/opt`.
* At the heart of the configuration, we download and install hashcat. Doing this gives us better performance than installing via the package manager, details follow below.
* Lastly, we set the machine to power off after a day (24 hours, 1440 minutes). This is a safeguard so we don't let the instance run until we catch it on the next bill.
* The files `.cloudinit_started` and `.cloudinit_completed` are created so we can quickly check if the installation has started and been completed.

And with this, only the `hashcatSecurityGroup` is left.
This resource can be considered as a bunch of firewall rules for our instance.
We allow inbound traffic on port 22, which is commonly used for SSH.
If you have a fixed IP address of your machine at home, feel free to extend the SecurityGroup so only your machine can connect.
For me, it was important to also give an IPv6 rule, because it's 2022.

Finally, note that I left out some parts at the `[...]` marker.
This is networking stuff that I won't explain here in detail.
In summary, it creates a VPC that we use our SecurityGroup for, and this then requires us to create an InternetGateway, Subnet, and RouteTable.

## Establish a Connection

The hard part is done.
Using the template is simple.
Still, how about we wrap a Makefile around it?
Provided that we have the template in `./hashcat.yaml`, I'm using a `./Makefile` with these contents:
```make
STACK_NAME := hashcat
KEY_NAME := aws

.PHONY: create
create:
	aws cloudformation create-stack --stack-name $(STACK_NAME) --parameters ParameterKey=paramKeyPair,ParameterValue=$(KEY_NAME) --template-body file://hashcat.yaml

.PHONY: delete
delete:
	aws cloudformation delete-stack --stack-name $(STACK_NAME)

.PHONY: describe
describe:
	aws cloudformation describe-stacks --stack-name $(STACK_NAME)

.PHONY: get_status
get_status:
	aws cloudformation describe-stacks --stack-name $(STACK_NAME) | jq -r '.Stacks[0].StackStatus'

.PHONY: get_ip
get_ip:
	aws cloudformation describe-stacks --stack-name $(STACK_NAME) | jq -r '.Stacks[0].Outputs | map(select(.OutputKey | contains ("PublicIp")))[0].OutputValue'
```

As you can see, this uses the AWS command-line tool.
Everything is done with the `cloudformation` subcommand in the region specified during configuration.

With `make create`, we request AWS to read our template and create the specified resources.
Note how we specify the `paramKeyPair` on the command line.
You can get an explanation of the syntax with `aws cloudformation create-stack help`.

Our request may take a while, up to a minute, to complete.
During this time, you can observe the status of your request with `make get_status`.
While the stack is being created, this returns `CREATE_IN_PROGRESS`.
When the operation is complete, the status changes to `CREATE_COMPLETE`, and we can retrieve the IP address of the new instance with `make get_ip`:[^getip]
```
$ make get_ip
3.86.125.30
```

Now let's SSH onto the machine:
```
$ ssh -i ~/path/to/your/ssh/key ubuntu@3.86.125.30
```

Here we can see the `.cloudinit_started` file was already created:
```
$ ls /tmp/.cloudinit_*
/tmp/.cloudinit_started
```

It only takes a bit until the installation of hashcat is complete:
```
$ ls /tmp/.cloudinit_*
/tmp/.cloudinit_completed  /tmp/.cloudinit_started
```
You can also confirm this by reading what's in `/var/log/cloud-init-output.log`.

This means hashcat must be ready, and it is indeed!
```
$ which hashcat
/usr/local/bin/hashcat
```

When we're done using hashcat, we close the SSH session and run `make delete`.
Everything is clean again, all resources are removed.
And even if we forgot to delete the stack, the machine would terminate after 24 hours.

## It's All About Performance

Ready for it?
I'll take a password from rockyou which appears a bit later in the list and hash it with MD5:
```
$ wc -l rockyou.txt
14344391 rockyou.txt

$ sed -n 11000000p < rockyou.txt
KASKAS8

$ printf 'KASKAS8' | md5sum
e8f535bb8c05c354404381b2021a5368  -
```

Okay, now we put this on the cloud machine and crack it:
```
$ echo "e8f535bb8c05c354404381b2021a5368" >> hashes.txt
$ hashcat -m 0 hashes.txt /opt/rockyou.txt
[...]

e8f535bb8c05c354404381b2021a5368:KASKAS8

Session..........: hashcat
Status...........: Cracked
Hash.Mode........: 0 (MD5)
Hash.Target......: e8f535bb8c05c354404381b2021a5368
Time.Started.....: Mon Mar 14 21:18:01 2022 (2 secs)
Time.Estimated...: Mon Mar 14 21:18:03 2022 (0 secs)
Kernel.Feature...: Pure Kernel
Guess.Base.......: File (/opt/rockyou.txt)
Guess.Queue......: 1/1 (100.00%)
Speed.#1.........:  4504.3 kH/s (8.55ms) @ Accel:512 Loops:1 Thr:64 Vec:1
Recovered........: 1/1 (100.00%) Digests
Progress.........: 11075584/14344384 (77.21%)
Rejected.........: 0/11075584 (0.00%)
Restore.Point....: 10649600/14344384 (74.24%)
Restore.Sub.#1...: Salt:0 Amplifier:0-1 Iteration:0-1
Candidate.Engine.: Device Generator
Candidates.#1....: SEXY#1ALLDAY -> IloveSanMahua17
Hardware.Mon.#1..: Temp: 38c Util: 34% Core: 627MHz Mem:2505MHz Bus:16
```

Only takes two seconds!
It's only MD5, yes, but it's a whole lot faster than my setup with john.

We can run proper benchmarks with `hashcat -b`:

{{< bootstrap-table table_class="table table-striped table-bordered" >}}
| Algorithm | Compiled locally | From repository |
|---|---:|---:|
| MD5 | 4594.1 MH/s | 4538.2 MH/s |
| SHA1 | 1734.2 MH/s | 1687.4 MH/s |
| SHA2-256 | 819.6 MH/s | 815.7 MH/s |
| SHA2-512 | 256.2 MH/s | 255.0 MH/s |
| WPA-PBKDF2-PMKID+EAPOL | 88754.0 H/s | 87002.0 H/s |
| NTLM | 7438.2 MH/s | 7358.9 MH/s |
| LM | 4312.7 MH/s | 4338.6 MH/s |
| NetNTLMv1 / NetNTLMv1+ESS | 4413.9 MH/s | 4197.3 MH/s |
{{< /bootstrap-table >}}

Here you also see a comparison between our own build and the build from the repository.
Why is the build faster for almost all algorithms?
My guess is that building hashcat on our own hardware allows the compiler to use its full instruction set, while the repository version must be more generic.
To be confirmed.

Either way, it's best to run the most recent version of hashcat if we aim for speed.

## Conclusion

The word "cloud" can be annoying at times, but I feel this project made me realize more of its strengths.
I will definitely continue using this setup and advance it further.
Of course, this may change just like the market does.
If you are curious to try it out, please head over to my [GitHub repository](https://github.com/eikendev/cloud-cracking).
Leaving a star will encourage me to improve the tool.

[^idea]: I'm not the first one to use hashcat in the cloud. In fact, there are many posts showing how this is done. The difference is that I want a properly automated solution.
[^provider]: This may vary depending on the hardware you configure.
[^budgets]: And if you're unfamiliar with all the pricing just like me, [create a cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html) and configure notifications for it. I use this to trigger an alert if my spending goes beyond a reasonable threshold.
[^permissions]: It would be even better to make the permissions as narrow as possible. But I lack the time to figure out the policies manually, and I have not found an automated approach that is not a hack. I'll leave it be, for now, after all, it would potentially block any future adjustments we make.
[^quotas]: Be aware the quotas are limiting the vCPUs of your instances. If you go for a different instance type, make sure to request a high-enough quota.
[^getip]: This reads the IP from the output we specified ourselves!
