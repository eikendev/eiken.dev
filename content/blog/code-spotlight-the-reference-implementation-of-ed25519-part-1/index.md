---
title: "Code Spotlight: the Reference Implementation of Ed25519 (Part 1)"
date: 2020-11-22T19:00:00Z
tags: ["crypto", "ecc", "ed25519"]
images: ["/img/blog/code-spotlight-the-reference-implementation-of-ed25519-part-1/card.webp"]
mathjax: true
---

Elliptic curve cryptography (ECC) has always been something I wanted to fully understand eventually.
A recent project I worked on has brought me one step closer, but also revealed to me the true complexity of the topic.
I am now convinced that I will probably never fully understand the maths behind ECC.

However, I discovered something else that I find interesting, although it's not necessarily easier: implementing given schemes.
In this post, I want to take you on a journey to explore a state-of-the-art implementation of a cryptographic scheme.

So what should be the main takeaway for you as a reader?
First of all, my goal is to provide some guidance on how to read a technical RFC and connect the dots to an implementation.
Along the way, you should get a first grasp of how cryptographic primitives are implemented.
This includes constant time requirements and all the bit twiddling that comes with it.

And finally, there are not a lot of resources on Ed25519 that require little background knowledge.
Thus, I want to take the opportunity and fill this gap a little by providing an "entry-level" crash course for Ed25519.
It won't hurt if you've studied some group theory before, but I'll link resources throughout the post in case you didn't.

Since this blog post will contain some cryptography, I should tell you that I'm no "expert" in this field myself, just a curious student.
Especially some details used in elliptic curve cryptography are new to me, so bear with me in case something isn't accurate.
If you spot a mistake, I'd love you to [reach out](https://twitter.com/eikendev)!

## Introduction

So what are we going to explore, exactly?
This post is about the reference implementation of [Ed25519](https://ed25519.cr.yp.to/).
Ed25519 is an instance of an Edwards-curve Digital Signature Algorithm (EdDSA).
As the name suggests, it can be used to create digital signatures.
If you're now wondering what digital signatures are: don't worry, I'll give a quick refresher in the next section.

Of course, other schemes provide the same functionality.
Recently, NIST has published the [draft for FIPS 186-5](https://csrc.nist.gov/publications/detail/fips/186/5/draft), also known as "Digital Signature Standard (DSS)".
It includes RSA, ECDSA, and EdDSA.[^dsa]

If there are other options, why did I pick Ed25519 for this post?
Well, the boring answer is that it's the scheme I've already come to explore in the past.
But I think Ed25519 stands out because many seem to agree that it's a good scheme---it's hard to find some good criticism.[^standardization]
And there might be several reasons for this:
- It's said to be secure and fast,
- its keys are relatively short in size, and
- it was designed by well-known folks from the crypto community (including [Daniel J. Bernstein](https://cr.yp.to/djb.html)) who argued for the choices of its parameters in detail.
Today, there is support for Ed25519 in [TLS 1.3](https://tools.ietf.org/html/rfc8446) and in [OpenSSH](https://www.openssh.com/) since [release 6.4](https://www.openssh.com/txt/release-6.5).

However, let's not forget that the focus of this post is the reference _implementation_, not the _scheme_.
What I find impressive is that Bernstein and his colleagues did not only come up with the scheme but also provided a reference implementation for it.
These people are not only professional mathematicians, but also good computer scientists!

Since the implementation contains quite a few optimizations that are worth addressing, I'll need to contain the scope a bit.
Hence, we'll focus on creating signatures, not on verifying them.
I have not decided yet if there will be a blog post about signature verification, but let me think about it.

## Source Code

The source code is provided as part of the [SUPERCOP](https://bench.cr.yp.to/supercop.html) project, which is a toolkit for evaluating the performance of cryptographic implementations.
Definitely check out SUPERCOP if you're interested in cryptography, it is mindblowing how many algorithms and implementations thereof are included in the package.[^githubmirror]

As of the end of 2020, the [performance comparison for Ed25519](https://bench.cr.yp.to/impl-sign/ed25519.html) lists the following four implementations:
- `ref`, the original reference implementation in C,
- `ref10`, an improved version of the reference implementation with roughly [20x speedup](https://blog.mozilla.org/warner/2012/02/11/new-ed25519-ref10-implementation-available-20x-faster/), and
- `amd64-51-30k` and `amd64-64-24k`, two platform-specific implementations in x86 assembly.

Naturally, the platform-specific implementations are faster.
But I'll not get us into the trouble of reading assembly in this post.
The center of attention in this post is the `ref` version, and I promise there's enough to discover.

Note that from here on, I will call the `ref` version just "reference".

To make things more readable, I refactored parts of the code as follows.
- Some variables were renamed to give them a more meaningful name and to help to understand the relation to the relevant RFCs.
- The placement of code was aligned with the order of steps in the relevant RFCs.
- Automatic code formatting was applied to provide consistent styling.

I don't think the refactoring stops you from seeing the similarity with the original code, though.

The refactored code is also published on GitHub in [this repository](https://github.com/eikendev/code-spotlight/tree/master/ed25519).
Keep in mind that I'm not the original author of that code.
I've only done some refactoring and started to document the code for me and anyone else that wants to learn from it.

## Digital Signatures

As promised, a little refresher on digital signatures follows.
Feel free to skip some paragraphs if you feel confident.

With a signature, we want to provide proof to someone else that we approve a message or contract.
This can be done using pen and paper, simply by writing our name under the message.
However, there are issues with written signatures.
For instance, someone can easily copy our signature and put it under a new contract.
Using digital signatures, we can leverage cryptography to prevent this kind of _attack_.
In essence, a digital signature can be seen as a digital analog to the written signature, but with a lot stronger security guarantees.

Let's consult [A Graduate Course in Applied Cryptography by Dan Boneh and Victor Shoup](https://toc.cryptobook.us/) for a proper definition.
During my studies, this _freely available_ book was among the most helpful resources.

> A signature scheme S = (G,S,V) is a triple of efficient algorithms, G, S and V, where G is called a key generation algorithm, S is called a signing algorithm, and V is called a verification algorithm. Algorithm S is used to generate signatures and algorithm V is used to verify signatures. (...)

From this, we learn there are three algorithms required for a digital signature scheme, namely
- a key generation algorithm,
- a signing algorithm, and
- a verification algorithm.

How would these algorithms be used?
Let's say Alice wants to send Bob a message, and sign it to prove her intention of sending it to Bob.[^aliceandbob]

{{< figure src="./digital-signatures.min.svg" alt="Process of Using Digital Signatures" caption="The process of using a digital signature scheme involves three algorithms." >}}

The first step for Alice is to generate keys using the key generation algorithm, from which she retrieves a public key and a secret key.
Alice must not give the secret key to anybody else so that nobody else can create signatures in her name.
The public key needs to be distributed securely to everyone that wants to verify Alice's signatures, which is only Bob in this scenario.
_Securely_ here means that we need to maintain authenticity so that nobody can trick Bob into thinking their public key belongs to Alice.

As a second step, Alice needs to create a signature using the signing algorithm.
The inputs to this algorithm are her secret key and the message she wants to sign.
If her intention is to send the message to _Bob_, she should make this clear in the message by explicitly writing his name as a recipient.
Otherwise, once Bob gets hold of the signed message, he could pass it on to a third person and trick them into thinking that they were Alice's intended recipient.

The message together with the generated signature is then transmitted to Bob.
Note that if only the signature was transmitted without the message, Bob would not be able to properly reconstruct the message.
In other words, the signature does not contain the message per se, it is rather a value calculated over the message and Alice's secret key.

Finally, Bob needs to verify Alice's signature using the verification algorithm.
Bob gives it Alice's public key, the received message, and the signature as inputs, and the algorithm will determine whether or not the given signature is valid for the message over Alice's public key.
If the algorithm _accepts_ the signature, and given that Alice's secret key is still secret as well as that Bob has Alice's actual public key, Bob can be certain that
- the message was signed by Alice, and she can not repudiate it, that
- the message was not altered intentionally (e.g., due to forgery) during transmission, and that
- the message was not altered accidentally (e.g., due to a communication error) during transmission.

These properties are also known as [non-repudiation, authentication, and integrity](https://crypto.stackexchange.com/a/5647) respectively.

With this knowledge, we can already make the first link to the code of the reference.
Remember SUPERCOP from earlier?
SUPERCOP requires all implementations to follow a standard interface, so it can programmatically link the primitive and measure its performance.
The interface for digital signature schemes contains the three operations we just discussed.
All operations need to be implemented as follows:
- generating keys is done via `crypto_sign_keypair()`,
- signing is done via `crypto_sign()`, and
- verifying is done via `crypto_sign_open()`.

In the reference, the implementations of those functions are located in the files `keypair.c`, `sign.c`, and `open.c` respectively.

To enforce the interface, SUPERCOP defines the following prototypes in `PROTOTYPES.c`.
```c
extern int crypto_sign(unsigned char *,unsigned long long *,const unsigned char *,unsigned long long,const unsigned char *);
extern int crypto_sign_open(unsigned char *,unsigned long long *,const unsigned char *,unsigned long long,const unsigned char *);
extern int crypto_sign_keypair(unsigned char *,unsigned char *);
```

And yes, the prototypes only provide little information about the parameters.
To get more information, it's best to have a look at an existing implementation.

As I have mentioned, our main focus in this post will be signing, which means we will examine `crypto_sign()` more closely.
But before we see what this function does, we should discuss what it is _supposed_ to do.

## Elliptic Curves

In the last section, we saw that a signature is calculated from a message and a secret key.
Unfortunately, we are missing one aspect to make this a bit more concrete: a background on elliptic curves.

Ed25519 is based on an elliptic curve that is specified in [RFC 7748](https://tools.ietf.org/html/rfc7748), and we call it "edwards25519".[^x25519]
Even though I will try to keep the maths behind elliptic curves contained, we need a basic understanding of the concepts.

To get started, I found [the primer on elliptic curve cryptography by Cloudflare](https://blog.cloudflare.com/a-relatively-easy-to-understand-primer-on-elliptic-curve-cryptography/) a fantastic resource to read.
And not to forget about [the introduction to ECC by Andrea Corbellini](https://andrea.corbellini.name/2015/05/17/elliptic-curve-cryptography-a-gentle-introduction/) and [its follow-up](https://andrea.corbellini.name/2015/05/23/elliptic-curve-cryptography-finite-fields-and-discrete-logarithms/), which provide the best visualization of elliptic curves I have seen so far.
Also, Fang-Pen Lin provides [a Jupyter notebook on GitHub](https://github.com/fangpenlin/elliptic-curve-explained) and [another great article about ECC](https://fangpenlin.com/posts/2019/10/07/elliptic-curve-cryptography-explained/) to read.

I'll only go over the most important stuff here, but since I know that this material is not easy, especially when confronted with it for the first time, I _highly_ recommend reading one of the linked articles before moving on.

### Curve Arithmetic

Let me first sum up the key sentences in Cloudflare's blog post.

> An elliptic curve is the set of points that satisfy a specific mathematical equation.

This equation for the curve is provided by the scheme we use.
Depending on the equation, we deal with a different _kind_ of curve.

For Ed25519, a specific [twisted Edwards curve](http://eprint.iacr.org/2008/013.pdf) is used, and its equation is
\\[ a x^2 + y^2 = 1 + d x^2 y^2 ,\\]
where \\(a = -1\\) and \\(d = -\\frac{121665}{121666}.\\)
So the points on the curve are the elements in the set
\\[ \\left\\{ (x, y) \\in \\mathbb{R}^2\\ |\\ a x^2 + y^2 = 1 + d x^2 y^2 \\right\\} .\\]

The three resources I linked base their explanation on a curve with horizontal symmetry, i.e., their curve is symmetric about the x-axis.
For Ed25519, however, the curve has vertical symmetry.

Elliptic curves come with some neat properties.

> A [one such] (...) property is that any non-vertical [non-horizontal for Ed25519] line will intersect the curve in at most three places.

This means that we can define an operation to retrieve a third point from two points on a curve, under the condition that the points do not lie on a _horizontal_ line (remember, our curve has vertical symmetry).
We call this operation _addition_.

If you wonder how we can "add" things that are not numbers, be told it's really just a name for an operation on two elements.
The reference uses this term, and we'll do so, too.
But be careful, addition here does not mean that the coordinates are added, it's more complicated than that!

For intuitive explanations on how this addition works graphically, [others have already done such a good job](https://andrea.corbellini.name/2015/05/17/elliptic-curve-cryptography-a-gentle-introduction/#geometric-addition) that I won't repeat it here.
Especially check out [this interactive tool by Andrea Corbellini](https://andrea.corbellini.name/ecc/interactive/reals-add.html), which uses another curve but illustrates the same concept.

In case the two points _do_ lay on a horizontal line, there's a trick we can apply to make the addition work.
In essence, a "fake" point is introduced to the curve, called the _point at infinity_.
This point is now an actual element of the curve, so we can further refine our definition to the set
\\[ \\left\\{ (x, y) \\in \\mathbb{R}^2\\ |\\ a x^2 + y^2 = 1 + d x^2 y^2 \\right\\}\\ \\cup\\ \\left\\{ 0 \\right\\} .\\]
Lucky for us, Bernstein and his colleagues have come up with a formula for an addition that does not care about this exception.

Lastly, note that we can also "add" a point to itself, and invert a point by inverting its x-coordinate (which always works because our curve is symmetric along the y-axis).
Altogether, the elements of the curve combined with the addition build a [group](https://en.wikipedia.org/wiki/Group_(mathematics)).
This is why we will refer to the points as _group elements_.

So if there is addition, do we also have multiplication?
Say there is a point \\(P\\) on the curve.
Using the addition, we could add the point \\(P\\) three times to itself like this: \\(P + P + P + P.\\)
See where this is going?

Simply put, we can "multiply" a group element with a _scalar_ (i.e., just a normal number) to retrieve another group element.
This operation is known as _scalar multiplication_.
The notation is a bit different than what we are used to, we usually write
\\[ P + P + P + P = [4]P = [2 + 2]P = [2][2]P .\\]

### Base Point

What's also to mention is that an instance of EdDSA needs to define a so-called _base point_ \\(B.\\)
Why do we need it?
Think about it as a reference location on the elliptic curve.
If we add the base point to itself \\(r\\) times, denoted as \\([r]B,\\) everybody that knows \\(r\\) also knows the resulting point \\([r]B\\) on the curve, because \\(B\\) is public knowledge.
In contrast, calculating \\(r\\) from \\([r]B\\) is very hard, and among cryptographers, this is referred to as the "elliptic curve discrete logarithm problem", or ECDLP.

For Ed25519, \\(B = (B_x, B_y)\\) is specified in RFC 7748, just like the curve, and it remains constant for any calculation with Ed25519.
In explicit numbers, we have
\\begin{array}{rcl}
B_x & = & 15112221349535400772501151409588531511454012693041857206046113283949847762202 \\\\
B_y & = & 46316835694926478169428394003475163141307993866256225615783033603165251855960
.\\end{array}

Yes I know, these numbers are large.
At this point you should realize that an implementation probably needs specialized algorithms to reach acceptable speed.

### Elliptic Curves over Finite Fields

Lastly, imagine ending up with points so large that our computers have problems calculating with them.
To make calculations feasible, it makes sense to introduce bounds on all values we deal with.
The solution is modular arithmetic.

Maybe you remember those congruence relations where we write \\[ a \\equiv b \\pmod n \\] for integers \\(a\\), \\(b\\), and \\(n\\).
What we mean by that is that there exists some integer \\(k\\) such that \\[ a = k n + b .\\]
If you've never heard of that, [Wikipedia](https://en.wikipedia.org/wiki/Modular_arithmetic) and [Khan Academy](https://www.khanacademy.org/computing/computer-science/cryptography/modarithmetic/a/what-is-modular-arithmetic) give some good introductions.

To combine modular arithmetic with elliptic curves, we can define an elliptic curve over a [finite field](https://en.wikipedia.org/wiki/Finite_field) \\(\\mathbb{F}_p\\) where \\(p\\) is a prime number.
The finite field \\(\\mathbb{F}_p\\) contains as elements all integers in the range \\([0, p - 1].\\)

For the finite field of curve25519, we have \\(p = 2^{255} - 19.\\)
This is also where the number 25519 in "Ed25519" comes from.

What does this all mean for our curve?

> Rather than allow any value for the points on the curve, we restrict ourselves to whole numbers in a fixed range.

Essentially, we restrict the elements of our curve further so that the _coordinates_ of a point must be elements of the finite field (so they must be non-negative integers less than \\(p\\)), which is why we will call them _field elements_ from here.
The curve over the finite field is now the set
\\[ \\left\\{ (x, y) \\in (\\mathbb{F}_p)^2\\ |\\ a x^2 + y^2 = 1 + d x^2 y^2 \\right\\}\\ \\cup\\ \\left\\{ 0 \\right\\} .\\]

What's crucial is that we must treat the coordinates differently now.
Before they were real numbers, but now they are elements of our finite field.
For instance, if we wanted to calculate the division \\[ x_c = \frac{x_a}{x_b} = x_a \cdot x_b^{-1} \\] for two coordinates \\(x_a\\) and \\(x_b\\), we would first have to find out the multiplicative inverse \\(x_b^{-1}.\\)
This is so that \\(x_c\\) ends up being an element of the finite field, meaning we can't use the division we normally use for real numbers because it could result in fractions.

Also, after each operation we need to check if our result is still in \\(\\mathbb{F}_p.\\)
As an example, think about an addition like \\[ (p - 1) + (p - 1) = 2p - 2 .\\]
If the result exceeds \\(p-1\\) like in this case, then we need to _reduce_ the result \\(x_c\\) to a number \\[ x_c' \\equiv x_c \\pmod p ,\\] for which \\(x_c'\\) is an element of the finite field.

How did introducing modular arithmetic change the arithmetic on the curve?
It's important to note that the addition and the scalar multiplication still work as expected.
The elements of the curve together with this addition still form a group.

Since \\(\\mathbb{F}_p\\) is finite, however, \\((\\mathbb{F}_p)^2\\) must be finite, too, meaning we have only finitely many points left to operate on.
Thus, the group is now a _finite_ group.

If you go back to the [interactive tool by Andrea](https://andrea.corbellini.name/ecc/interactive/modk-add.html), you will see that there are indeed only finitely many points on a curve over a finite field.
The tool lets you also observe that the curve is still symmetric about the same axis as before (the y-axis for Ed25519).
Further, we can still invert a point by inverting its coordinate of the other axis.

And what happens now when we take the base point and add it onto itself very often?
The explanation for this is a bit more involved.

In summary, we will use the base point as a _generator_.
In other words, our base point \\(B,\\) can be used to reach a subset of all available points on the curve over the finite field by calculating the scalar multiples \\[ \\left\\{ [0]B, [1]B, [2]B, \ldots \\right\\} .\\]
This set is the _subgroup_ generated by \\(B\\), and it is finite, too.
Since this subgroup is of prime order \\(L,\\) meaning the number of elements in the subgroup is prime, it is _cyclic_.
This means that after adding \\(B\\) onto itself often enough, we'll end up with the base point again.
So the addition "wraps around" like in modular arithmetic, and in fact the subgroup behaves just like the integers modulo \\(L.\\)

{{< figure src="./cyclicgroup.min.svg" alt="Finite and Cyclic Group" caption="In EdDSA, the base point generates a finite and cyclic subgroup of the elliptic curve. Note that \\(L\\) is the order of the subgroup that \\(B\\) generates. Because the subgroup is finite and cyclic, we have \\( [L]B = [0]B \\)." >}}

### Elliptic Curves in Cryptography

We will accumulate more knowledge about elliptic curves on-demand.
For now, this should be enough for us to calculate with the points on a curve and give points a "meaning".

> An elliptic curve cryptosystem can be defined by picking a prime number as a maximum, a curve equation and a public point on the curve. A private key is a number priv, and a public key is the public point dotted [added] with itself priv times.

Note that the terms "private key" and "secret key" are used interchangeably.
One argument for using "secret key" is that its abbreviation "sk" fits nicely with the abbreviation of "public key", "pk".
"Secret key" also better communicates that the data is to be kept secret.
I don't have strong preferences, but since different resources use different terminology, we'll probably switch back and forth to match the context.

## Creating Signatures

Before looking at any code, let me summarize quickly how the scheme works.
The goal is not to understand any security implications, but rather to see how a signature is calculated.

From here, remember that \\(||\\) is used to denote the concatenation of bytes, and that \\(\\mathrm{H}\\) is a [cryptographic hash function](https://en.wikipedia.org/wiki/Cryptographic_hash_function).
In Ed25519, \\(\\mathrm{H}\\) is [SHA-512](https://en.wikipedia.org/wiki/SHA-2).

I will use a subscripted "b" to indicate that a variable is the encoding of something and not the mathematical value.
Encodings are relevant for two reasons:
- We need a representation of points and scalars that other implementations can understand. Say we want to transmit a point on the curve, the encoding gives a common format on how the point is to be transmitted.
- If we calculate a hash of a point, the representation of that point must be exactly the same among different implementations. This is because if we want to agree with other parties on a hash output, the input to the hash function must be the same for everyone who wants to verify that hash output.

Let's assume that we have a private key, which is a bunch of (truly) randomly generated bytes.
- From this key, we derive the secret scalar \\(s\\) and the so-called _prefix_. The public key is then \\( A = [s]B .\\)
- The prefix and the message \\(M\\) are used to derive the _nonce_ \\( r = \\mathrm{H}(\\mathrm{prefix}_b || M_b) ,\\) which itself is used to derive the _commitment_ \\( R = [r]B .\\)
- Next, the _challenge_ is calculated as \\( k = \\mathrm{H}(R_b || A_b || M_b) .\\)
- Finally, the _proof_ is calculated as \\( S = r + k s ,\\) where \\(s\\) is the secret scalar.
- The resulting signature is the pair \\((R, S).\\)

Note that I used the terminology (nonce, commitment, etc.) from [Schnorr signatures](https://en.wikipedia.org/wiki/Schnorr_signature), but the variable names are consistent with the relevant RFC.

Maybe you are overwhelmed by this mix of formulas now, so I tried to illustrate the data flow in the following figure.

{{< figure src="./signing.min.svg" alt="Data Flow in the Signing Procedure of Ed25519" caption="The data flow in the signing procedure of Ed25519. Inputs are colored in blue, and outputs in green. Further, points of the elliptic curve (and their encodings) are drawn as disks, while scalars are rectangles with rounded corners." >}}

The base point \\(B\\) is treated as input in the figure because it can be different for other instances of EdDSA.

As you can see, there are three calculations of SHA-512 in total.
For this reason, a high-performance[^runtimeperformance] Ed25519 implementation needs to rely on a fast SHA-512 implementation.
But do not underestimate the scalar multiplication!
Later we will see how much thought went into optimizing it.

In case you want to have some more mathematical background than given here, I recommend you to start with [David Wong's blog post about Schnorr signatures](https://cryptologie.net/article/193/schnorrs-signature-and-non-interactive-protocols/).
Schnorr signatures are based on the same concept, and in [another blog post](https://cryptologie.net/article/497/eddsa-ed25519-ed25519-ietf-ed25519ph-ed25519ctx-hasheddsa-pureeddsa-wtf/) David perfectly points out two major differences.

Aside from the differences he addresses, what confused me the most at first is that the schemes use the term "private key" for different things.
- In Schnorr signatures, we have a private key \\(x\\) and calculate the public key \\(g^x.\\) The private key is used to calculate the proof \\[ d = e - x c .\\]
- In Ed25519, we have a private key from which we derive the secret scalar \\(s.\\) As outlined above, it is this secret scalar \\(s\\) that is used to calculate the proof, not the private key directly.

I think the reason for this difference is that in Ed25519, we derive two values from the private key: the nonce and the secret scalar.
In particular, an Ed25519 private key is hashed, and then one half of the digest is used as the secret scalar and the other half is used to derive the nonce.
For Schnorr signatures, in contrast, the nonce is randomly generated.[^nonce]

Finally, a difference I'm not fully certain about concerns the signatures themselves.
- Schnorr signatures appear to consist of the pair \\((c, d),\\) with \\(c\\) being the _challenge_ and \\(d\\) being the proof.
- Ed25519 signatures, however, are made of the pair \\((R, S),\\) so the _commitment_ and the proof.

This might have to do with how the verification is done.
For Schnorr signatures, the verifier derives \\[ c' = H(m || y^c g^d) \\] from the signature and the public key \\(y = g^x,\\) and then checks \\(c = c'.\\)
For Ed25519 signatures, the verifier derives the challenge \\(k\\) and then checks if \\[ 8[S]B = 8R + 8[k]A ,\\] which works for valid signatures because \\[ 8[r+ks]B = 8[r]B + 8[k][s]B .\\]

But as mentioned, this is where I'm not so sure myself, so take it with a grain of salt.

## High-Level Implementation

Now we should have all the pieces together and it's time to jump into the code.

We already know that `sign.c` contains a `crypto_sign()` to sign messages.
Since Ed25519 is standardized, we can have a peek at [section 5.1.6 of RFC 8032](https://tools.ietf.org/html/rfc8032) to see how it is supposed to be implemented.[^originalpaper]

First, the RFC lists the inputs of the function.

> The inputs to the signing procedure is the private key, a 32-octet string, and a message M of arbitrary size.

So it must be the secret (private) key and the message, just like in our example before.
Let's compare this to the code!
The full function signature looks as follows.
```c
int crypto_sign(
    unsigned char *signed_message,
    unsigned long long *signed_message_len,
    const unsigned char *message,
    const unsigned long long message_len,
    const unsigned char *private_key
)
```

Wait, there are now five parameters instead of two?
Well, the first parameter, `signed_message()`, is used as an output.
It will contain the message together with the signature, i.e., the result of the signing procedure.

Since the message can have arbitrary length according to the RFC, we need to pass along a length so that the program knows how long the buffer is.
We know that the resulting `signed_message()` will also have an arbitrary size (it contains the message), which implies that we need to specify a length for it, too.
In total, that makes for
- two pointers to the input buffers and
- one for the output buffer, together with
- two numbers specifying the sizes of the message buffer and the result buffer.

The result of the signing procedure is a valid signature in the `signed_message` buffer, together with the message that was originally passed into it.
The valid signature consists of the encodings of the commitment and the proof.

In short, both the function parameters as well as the way the signature is appended to the input message are specific to the reference.
This behavior is not specified in the RFC.

Now we know the interface of the function, but it is still a gray box.
We discussed the algorithm of the signing procedure conceptually, but we haven't seen it's implementation yet.
Let's open the box and see what's inside, shall we?

The RFC divides the signing procedure into six steps.
I will walk you through these one-by-one.

Note that we will encounter several functions or types that start with either `fe25519`, `ge25519`, or `sc25519`.
For the moment, we assume these are just provided.
They will be discussed later on as well, but I think it makes sense to first give an impression of the higher-level procedure, and then go more in-depth afterward.

### Step 1: Computing the Secret Scalar and the Prefix

In the first step, the secret scalar is calculated.

> Hash the private key, 32 octets, using SHA-512. Let h denote the resulting digest. Construct the secret scalar s from the first half of the digest, and the corresponding public key A, as described in the previous section.

So, first, we have to hash the private key.
```c
unsigned char h[64];
crypto_hash_sha512(h, private_key, 32);
```
`crypto_hash_sha512()` is used by SUPERCOP as a generic name for a function that provides SHA-512, a cryptographic hash function.
Depending on your setup, SUPERCOP can benchmark different implementations for SHA-512 and pick the fastest one for your machine (which is OpenSSL for me).
But this is just a side note.
What's important here is that `h` will contain the hash of the secret key.

Then the RFC refers to section 5.1.5 which describes the key generation.

> Prune the buffer: The lowest three bits of the first octet are cleared, the highest bit of the last octet is cleared, and the second highest bit of the last octet is set.

Since only the first half of the digest is used for calculating the secret scalar, the "last octet" here is the 32nd byte.
```c
h[0] &= 248;
h[31] &= 127;
h[31] |= 64;
```
To make it a bit more obvious, let's represent the scalars in binary.
```python
>>> bin(248)
'0b11111000' # The lowest three bits are zero.
>>> bin(127)
'0b1111111' # The highest bit is zero.
>>> bin(64)
'0b1000000' # The second highest bit is one.
```
If this still does not make sense to you, have a look at [the Wikipedia explanation for bit masking](https://en.wikipedia.org/wiki/Bitwise_operation#AND).

Now, why do we clear and set bits like that in the first place?
I'll not answer this question here, because it requires some more mathematical background.
But there is [an awesome blog post by Neil Madden](https://neilmadden.blog/2020/05/28/whats-the-curve25519-clamping-all-about/) about this exact topic.

The RFC then tells us how to interpret the result.

> Interpret the buffer as the little-endian integer, forming a secret scalar s. (...)

```c
sc25519 secret_scalar;
sc25519_from32bytes(&secret_scalar, h);
```
What exactly happens here will become important later.
For now, all you need to know is that `sc25519` is a type used to represent scalars.

The rest of the steps of the key generation procedure will instruct us on how to calculate the public key.
Here, the implementation assumes that the public key can be copied from the arguments to the signing function.
The reason for this is that it's probably safe to assume that the user has someplace to store that public key.
```c
unsigned char public_key[32];
memmove(public_key, private_key + 32, 32);
```
Hold on, why are we copying parts of the secret key and interpreting them as the public key?
We aren't actually: When you trace the buffer back to where it is built, you will see that both the secret key and the public key are concatenated and stored in the same buffer.
Hence, the passed buffer `private_key` is not 32 bytes but 64 bytes long, but only the first half contains the secret key.

We still haven't used the full digest of the SHA-512 calculation.
Let's see what happens to the second half.

> Let prefix denote the second half of the hash digest, h[32],...,h[63].

So there's not really a calculation.
But by declaring a pointer it becomes more readable later.
```c
unsigned char *prefix = h + 32;
```

### Step 2: Computing the Nonce

As a next step, we process the message buffer.
In general, since we operate on an elliptic curve, we need a way of representing the message in our mathematical model.
In the case of Ed25519, the message is hashed, and the resulting digest is interpreted as a scalar.

> Compute SHA-512(dom2(F, C) || prefix || PH(M)), where M is the message to be signed. Interpret the 64-octet digest as a little-endian integer r.

Note that `prefix` was calculated in the first step.

You may wonder what `dom2()` and `PH()` are about.
The thing is that in reality there are multiple variants of EdDSA using the edwards25519 curve: Ed25519ph, Ed25519ctx, and Ed25519.
For a good explanation of the differences between them, read [this blog I mentioned earlier](https://cryptologie.net/article/497/eddsa-ed25519-ed25519-ietf-ed25519ph-ed25519ctx-hasheddsa-pureeddsa-wtf/).
The important thing is that the reference implements "plain" Ed25519, a variant where these two functions are trivial.
In the parameter table in section 5.1 of the RFC, `PH()` is defined as the identity function for Ed25519.
Directly below the table, `dom2()` is defined as follows.

> For Ed25519, dom2(f,c) is the empty string.

This means for Ed25519 we can reduce the expression to `SHA-512(prefix || M)`.
Let's see how the reference implements it.
```c
memmove(signed_message + 64, message, message_len);
memmove(signed_message + 32, prefix, 32);
```
The `signed_message` variable is used as a buffer to concatenate the prefix and the message.
Note that at this point, the variable name `signed_message` is misleading, since the prefix will not be part of the signed message.

Then, the hash is calculated over the prepared buffer.
```c
unsigned char r_digest[64];
crypto_hash_sha512(r_digest, signed_message + 32, message_len + 32);
```

Finally, the RFC instructs us to interpret the result as a scalar.
We did this before for the secret scalar, but this time we interpret 64 bytes instead of 32 bytes.
```c
sc25519 r;
sc25519_from64bytes(&r, r_digest);
```
This is our nonce.

### Step 3: Computing the Commitment

Now we get to do the first calculation on the elliptic curve!
Let's read what the RFC requires us to do.

> Compute the point [r]B. For efficiency, do this by first reducing r modulo L, the group order of B. Let the string R be the encoding of this point.

\\(r\\) was already calculated in the last step, so we can do the scalar multiplication right away.
```c
ge25519 rB;
ge25519_scalarmult_base(&rB, &r);
```

The RFC also tells us to _reduce_ \\(r\\).
I briefly mentioned reductions earlier, but we'll discuss it when we look at the lower-level implementation.
For now it's enough to know that the reduction of \\(r\\) is taken care of by `sc25519_from64bytes()` in the previous step.

Then, the new point \\([r]B\\) (named `rB` in the code) is encoded as described in the RFC.
The encoding (`R` in the RFC) is directly written into the `signed_message` buffer.
```c
ge25519_pack(signed_message, &rB);
```
Note that strictly speaking, moving the encoding into `signed_message` is not actually part of the third step in the RFC, but done here for efficiency reasons.
One could store the result in a dedicated buffer for the moment, but in the next step, it needs to end up in this spot anyway.

With this step, we are halfway through.

### Step 4: Computing the Challenge

Before we can retrieve that second puzzle piece, we first need to calculate the challenge.

> Compute SHA512(dom2(F, C) || R || A || PH(M)), and interpret the 64-octet digest as a little-endian integer k.

As before, `dom2()` is the empty string and `PH()` is the identity function, meaning we can reduce it to `SHA512(R || A || M)`.
We just moved the encoding of \\([r]B\\) into the beginning of the `signed_message` buffer, and the message (denoted as `M`) is already at its place, too.
Thus, we only need to move the public key (denoted as `A`) into the buffer and calculate the hash.
```c
memmove(signed_message + 32, public_key, 32);

unsigned char hram[64];
crypto_hash_sha512(hram, signed_message, message_len + 64);
```

Again, we interpret the 64-byte digest as a scalar.
```c
sc25519 k;
sc25519_from64bytes(&k, hram);
```

### Step 5: Computing the Proof

Finally comes the proof, which is the second piece of our signature.

> Compute S = (r + k * s) mod L. For efficiency, again reduce k modulo L first.

This is a calculation with scalars.
Actually, these are very large scalars, but the magic functions take care of that.
```c
sc25519 *S = &k;
sc25519_mul(S, &k, &secret_scalar);
sc25519_add(S, S, &r);
```

Similar to before, the reduction of \\(k\\) has already happened in `sc25519_from64bytes()`.

### Step 6: Forming the Signature

We're close to done.
The RFC also specifies how exactly we are supposed to build the signature.

> Form the signature of the concatenation of R (32 octets) and the little-endian encoding of S (32 octets; the three most significant bits of the final octet are always zero).

At this stage, the `signed_message` buffer contains `R || A || M`.
We are left with writing \\(S\\) into the buffer, so we retrieve `R || S || M`.
```c
sc25519_to32bytes(signed_message + 32, S);
```

Finally, the reference writes the output length.
```c
*signed_message_len = message_len + 64;
```

The final length of the output is the length of the message plus 64 bytes.
This is because the signature has a length of 64 bytes (512 bits):
Both the encoding of \\(R\\) and that of \\(S\\) have length 32 bytes.

### Function Summary

That's it for the signing procedure, at least on the higher level.
So no, we're not done here.
Now comes the tricky part.
We'll continue with those curious functions starting with `fe25519`, `ge25519`, and `sc25519`.

Some of you might want to see the code in full.
You can find it [here on GitHub](https://github.com/eikendev/code-spotlight/blob/master/ed25519/refactored/sign.c).

Now, how do we use this function in practice?
It really depends on what you want to do.
First of all, if you want to use Ed25519 for your side project, it's best to use a library for "end-programmers".
[libsodium](https://doc.libsodium.org/) is often mentioned as a good option.
Further, using the reference itself might not give the best performance.
It's very portable[^ref10], but implementations that make use of architecture-specific instructions can give huge performance benefits.
Libraries can provide good performance and convenient use.

If you still want to use the function directly, I'll refer you to SUPERCOP.
In particular, look at the `measure.c` file in the `crypto_sign` module.

## Let's Dig Deeper: Implementing the Curve Arithmetic

What we didn't see yet is how the magic functions like `ge25519_scalarmult_base()` are implemented.
And this is where most care has to be taken.
In other words, the interesting stuff begins here.

In principle, there are four basic types that we operate on in this implementation, namely
- `sc25519` for scalars, where `sc` abbreviates "scalar",
- `fe25519` for field elements, where `fe` abbreviates "field element", and
- `ge25519` and `ge25519_aff` for group elements, where `ge` abbreviates "group element".

The operations on these types are implemented in the modules `sc25519.c`, `fe25519.c`, and `ge25519.c`, respectively.
We will turn our focus there next.

But one step after another.
We've certainly made good progress today, and we'll proceed in another part.
For those that don't want to miss it, I'll announce the next part via Twitter, so [follow me](https://twitter.com/eikendev) to stay tuned!

[^aliceandbob]: [Alice and Bob](https://en.wikipedia.org/wiki/Alice_and_Bob) are names commonly used in the context of cryptographic schemes and protocols.
[^dsa]: NIST does no longer approve DSA for creating new signatures.
[^githubmirror]: No, I couldn't find an official mirror on GitHub either. I guess it's best to just download the source from [bench.cr.yp.to](https://bench.cr.yp.to/supercop.html).
[^nonce]: The key to this is that the hash function is supposed to provide [pre-image resistance](https://en.wikipedia.org/wiki/Cryptographic_hash_function#Properties), which means we can regard the output random for our purposes here.
[^originalpaper]: The process is also explained in [the original paper by Bernstein and his colleagues](https://ed25519.cr.yp.to/ed25519-20110926.pdf), but the RFC serves as a good technical reference.
[^ref10]: To my knowledge `ref10` should be just as portable.
[^runtimeperformance]: I'm aware some people in academia differentiate runtime and performance, and that's perfectly fine. But normally, the terms are used interchangeably, so I just went with "performance".
[^standardization]: There is [some good criticism](https://hdevalence.ca/blog/2020-10-04-its-25519am) on the _standardization_ of the scheme.
[^x25519]: Actually, the RFC defines the elliptic curved used for [X25519](https://cr.yp.to/ecdh/curve25519-20060209.pdf) (a Diffie-Hellman function), but the curve used for Ed25519 is _birationally equivalent_ to that of X25519. If I understood correctly, this means that except for a few special cases each point on one curve can be mapped to a corresponding point on the other curve. To read up on the details, consult [this Stack Exchange thread](https://crypto.stackexchange.com/a/43015).
