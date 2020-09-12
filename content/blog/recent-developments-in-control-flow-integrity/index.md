---
title: "Recent Developments in Control-Flow Integrity"
date: 2020-09-12T21:52:00Z
tags: ["security", "cfi"]
---

I was a bit busy in the past few months, but now I'm back to talk about some system security.
During my Bachelor's studies, I did a bit of reading on Control-Flow Integrity (CFI).
Recently, I've stumbled upon a paper on CFI, and while giving it a read I found myself in the need of refreshing the basics.
I thought I could use this opportunity to tell you about CFI and what current research is trying to achieve.

## Introduction

C is a simple and powerful language.
It's still being widely used, especially for applications where hardware must be directly controlled or memory management highly optimized.
Among others, kernels, device drivers, databases, web servers, and media-related software projects are typically (at least partially) written in C.

In contrast to modern languages like [Rust](https://www.rust-lang.org/) and [Go](https://golang.org/), C does not provide memory safety.
As a result, data on the stack or heap can be corrupted during the execution of the program if no serious care is taken.
To this day, this leads to horrendous security issues.

For this reason, additional security measures were introduced.
As an example, you may already know about address space layout randomization (ASLR), a method used to randomize the virtual base addresses of different parts of the memory space of a program.
To get an overview of other mitigation methods, I can recommend [this post](https://www.crowdstrike.com/blog/state-of-exploit-development-part-1/) on CrowdStrike's blog.[^2]

Although techniques have been invented to make software written in such languages less error-prone, attackers are creative enough to find new ways to circumvent these measures.
For instance, an ASLR-enabled binary can be attacked by leaking an address during execution, and SMEP is easily bypassed with return-oriented programming (ROP).
This is why new defense strategies gained a lot of interest in recent years, of which I want to specifically name
- control flow hijacking protection like fine-grained CFI which is used to keep the control flow within expected bounds,
- temporal memory safety, to prevent use after free (UaF) exploits,
- spatial memory safety including memory error detection using [AddressSanitizer](https://github.com/google/sanitizers/wiki/AddressSanitizer), and
- moving target defense (MTD), which can be used to transform the attack surface over time.

In this post, we will limit the scope to CFI.

## Fundamentals of CFI

For a more extensive explanation of what CFI is, I'd like to refer you to [Mathias Payer's introduction to the topic](https://nebelwelt.net/blog/20160913-ControlFlowIntegrity.html).
There are also more formal definitions in recent literature, but I'll try a bit more concise in my own words.

So, CFI describes the goal of keeping the execution trace of a program within expected bounds.
This prevents an attacker from manipulating the execution trace to their favor.

Let me first introduce two components to describe how CFI works, namely
- a **monitor** that is used to keep track of the execution of the program, and
- an **oracle** that can tell which control flow transfers are allowed at a certain step during its execution.

More formally, the oracle maintains a *points-to set* for each source address.
The points-to set of a source address contains all target addresses to which control flow can be transferred from that source addresses.
In literature, the process of determining the points-to set is called *points-to analysis*.

You may wonder how this helps, but we're almost there.
Using the monitor we can see which address the program currently executes.
When the program executes the next instruction, we need to query the oracle and ask whether the new address is in the points-to set of the previous address.
If it isn't, then something must be wrong, and we can terminate the program.

To illustrate, let me give you a modified version of the code snippet that was used to introduce [PittyPat](https://www.usenix.org/conference/usenixsecurity17/technical-sessions/presentation/ding) at USENIX Security 2017.

```c
void dispatch() {
	while(1) {
		void (*handler)(struct request *) = 0;
		struct request req;

		parse_request(&req);

		if (req.auth_user == ADMIN) {
			handler = priv;
		} else {
			handler = unpriv;
		}

		strip_args(req.args); // stack buffer overflow
		handler(&req);
	}
}
```

Here, a server processes user requests.
Depending on the privileges of the requesting user, a different handler function is executed.

As the comment indicates, a buffer overflow enables an attacker to modify data on the stack.
The attacker could, for instance, overwrite `handler` that is later called.
But we know that only two different functions can be called after `strip_args()`, namely `priv()` and `unpriv()`.
If the program was to call `execv()` instead, something cannot be right.
Determining if something is right or not primarily depends on the oracle we introduced.
The oracle we introduced will tell us that `execv()` is not in the points-to set of the source address.

Unfortunately, it is not trivial to determine the points-to set of a source address.
A points-to set does not even need to be constant throughout the execution of a program.
Hence, research has evolved in how the oracle should behave, i.e., what *policy* it should enforce, and we will look at this in the next section.

Note that pages on modern systems are never marked as both executable and writable at the same time.
Thus, CFI is mostly concerned with *indirect* control flow transfers, i.e., transfers where the target address is evaluated during run-time.

Before we end this section, I want to quickly mention the different scopes of CFI.
In our example, the attacker could have leveraged the buffer overflow to modify the return address of the call to `strip_args()`.
To detect this using CFI, we would also need to determine to where we can return from a given source address.
Thus, literature usually differentiates between
- *forward-edge* CFI, that restricts protection to jumps and calls, and
- *backward-edge* CFI, that deals with returns from function calls.

## Path Sensitivity in CFI

Back in 2017, Ding et al. published their work on PittyPat, a CFI system.
Similar to other publications before they pointed out that it's important to have not only a dynamic points-to set but specifically that the points-to set must depend on the whole execution trace when the program runs.[^3]
Systems with that property are called *path-sensitive*.

To explain why this is necessary, they used the program we have seen earlier.
Here's the snippet to remind ourselves of how it worked.

```c
void dispatch() {
	while(1) {
		void (*handler)(struct request *) = 0;
		struct request req;

		parse_request(&req);

		if (req.auth_user == ADMIN) {
			handler = priv;
		} else {
			handler = unpriv;
		}

		strip_args(req.args); // stack buffer overflow
		handler(&req);
	}
}
```

For instance, if the first loop iteration processes a privileged user, the `priv()` function is added to the points-to set.
If the next iteration then processed an unprivileged user, the `unpriv()` function is added to the points-to set, but the `priv()` function needs to be removed.
The removal of elements was not part of earlier work, but it is crucial for the integrity of the control flow: if both target addresses were part of the points-to set, an attacker could make use of this by manipulating the stack so `priv()` is called when an unprivileged user makes the request.

On a higher level, PittyPat monitors the execution of a program and derives its execution path.
This context is then used to determine the points-to sets for source addresses.
To make use of the context, PittyPat is given some representation of the code (an LLVM IR) upon the start of the monitored program.

Since the points-to analysis is performed continuously during the execution of the program, we call it an *online* analysis.
With an online analysis, the oracle is updated during the execution.

## Points-to Sets as Singletons

So far so good.
But then, two years later in [their work on μCFI](https://dl.acm.org/doi/10.1145/3243734.3243797), Hu et al. discovered that this scheme could be improved.
To explain why this was necessary, they provided a code snippet similar to the following.

```c
typedef void (*FP)(char *);
void A(char *); void B(char *); void C(char *);

void handleReq(int uid, char *input) {
	FP arr[3] = {&A, &B, &C};
	FP fun = NULL;

	if (uid < 0 || uid > 2)
		return;

	// uid is in {0, 1, 2}

	if (uid == 0) // uid is 0
		fun = arr[0];
	else // uid is in {1, 2}
		fun = arr[uid];

	char buf[20];
	strcpy(buf, input); // stack buffer overflow

	(*fun)(buf);
}
```

The difference to the previous example is that the same variable that is used for the condition is now also used for assigning the function pointer.
Thus, considering the case of `uid == 1`, the bare knowledge of the branch yields a points-to set with `B()` and `C()`.

But we can be more restrictive!
The branch itself does not allow us to deduce more information, but our conditional variable `uid` does.
This lead the researchers to the idea that the points-to analysis could always deduce a single target address from a given context, i.e., all points-to sets should have a single element.
That property was then named unique code target (UCT) property.

I think the property is pretty intuitive.
Since the program needs to determine a single value for `fun`, the context must always allow for exactly a single target address.
Hence, if the oracle was perfect, the points-to set has always just a single target address at a specific step in the execution trace.
That is if the oracle is given the full execution context at that step.

## Requirements of Online Analyses

As always, the additional layer of security comes at its own cost.

The concepts from above require an online points-to analysis.
Naturally, this leads to high run-time overhead, because we continuously determine a new points-to set.
According to their papers, PittyPat and μCFI introduce a performance overhead of roughly 13% and 2% respectively, which for me comes as a surprise.
Still, according to other research, these systems are impractical for larger programs.

With an online points-to analysis, we now also need a mechanism that feeds us the information we use for performing the online points-to analysis.
The two systems we highlighted so far leverage Intel PT for this.
But generally, this mechanism might not be available on certain platforms.

Additionally, [control flow tracers](https://en.wikipedia.org/wiki/Branch_trace) might not capture every flow control transfer.
This could be either because there are so many transfers that the tracer cannot keep up, or because the tracer is just invoked at certain points of the execution, e.g., at system calls.

## Origin Sensitivity in CFI

So "perfect" path sensitivity is not lightweight and comes with an uncomfortable requirement.
Additionally, implementing path sensitivity for the general case turns out to be tricky.

But can we find a similar CFI property that does not require online points-to analysis, while keeping a comparable level of security?
Exactly this was the goal of [more recent research on CFI](https://www.usenix.org/conference/usenixsecurity19/presentation/khandaker) presented at USENIX Security 2019.

Khandaker et al. introduce a system with static analysis (meaning the analysis happens before running the program) with an *origin-sensitive* policy.
To give you an idea of what this new property achieves, I want to explain *equivalence classes* (ECs) in the context of CFI first.

How real-world implementations like [RAP](https://grsecurity.net/rap_announce2) and [LLVM CFI](https://clang.llvm.org/docs/ControlFlowIntegrity.html) currently work is that they group targets into ECs.[^4]
The abstraction improves the performance but weakens the security guarantees: if two addresses were in the same EC and we need to have one address in our points-to set, the other address would inherently also be needed to be in the points-to set, because we can no longer distinguish between them.

According to the paper, the goal for a static CFI system is now to minimize the average size of all ECs, as well as the size of the largest EC.
This is done by changing the criteria by which targets are grouped.

In the case of origin sensitivity, elements in an EC share their origin.
The authors define the origin as a tuple `(CS, I)`.[^5], where `I` is the instruction where the function pointer is written (remember that we deal with indirect flow control transfers) and `CS` is the instruction that calls the function where `I` is located.
They report great effectiveness throughout [SPEC CPU2006](https://www.spec.org/cpu2006/), which is a standard benchmark suite.

## Conclusion

Of course, there are also different approaches to detecting flow control hijacking, like [CPI and CPS](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/kuznetsov).
Mathias published [a great comparison of CFI, CPI, and CPS](https://nebelwelt.net/blog/2014/1007-CFICPSCPIdiffs.html) back in 2014, but I think it is a bit outdated given the recent advancements in CFI.

Anyway, this was already everything I wanted to cover in this post.
I am convinced that the future will bring new and further enhanced CFI systems.
Maybe we someday end up with a path-sensitive system that is lightweight enough for complex programs.
In either case, going from here the best we can hope for is that memory safety will continue to be treated with high importance in language design and that more projects open up for the use of memory-safe languages in their codebase.

[^2]: The post is focused on mitigations for Windows, but the principles are similar on other operating systems.
[^3]: [πCFI](https://dl.acm.org/doi/10.1145/2810103.2813644) and [PathArmor](https://dl.acm.org/doi/10.1145/2810103.2813673) introduced similar systems.
[^4]: Read [this article](https://nebelwelt.net/blog/20181226-CFIeval.html) for more information on this.
[^5]: Actually, the paper gives two definitions. I simplified this here because I wanted to prevent the complexity of suddenly switching over to C++.
