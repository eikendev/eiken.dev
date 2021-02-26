---
title: "How to Break Your JAR in 2021 - Decompilation Guide for JARs and APKs"
date: 2021-02-25T11:00:00Z
tags: ["reverse-engineering", "android", "java"]
images: ["/img/blog/how-to-break-your-jar-in-2021-decompilation-guide-for-jars-and-apks/card.png"]
---

In the past few days, I had some fun trying to understand the inner workings of an APK file.
Previously, I had only used the legendary [JD-GUI](http://java-decompiler.github.io/) as a decompiler for some CTF challenges.
But when dealing with more complex code, I found that looking at the output of different decompilers can help.
Hence, I did a little research to find more decompilers that use different approaches.
This post serves as a little reference on how to build and use these tools.

## Introduction

Let's start with what JAR files and APK files have in common.
When an Android app is built, the sources would first be compiled into JVM bytecode.
After that, the JVM bytecode is compiled into Dalvik bytecode.
While JVM bytecode is found in `.class` files inside JARs, Dalvik bytecode is found in `.dex` files inside APKs.

That means, to reconstruct the source code for an APK file, there are two approaches:
- either we find a decompiler that directly reconstructs the source code from Dalvik bytecode, or
- we translate the Dalvik bytecode to JVM bytecode and use a normal Java decompiler from there.

For the first approach, [jadx](https://github.com/skylot/jadx) is the way to go.
If your target is an APK file, you should definitely give this tool a try.
I saw that a lot of APK analyzers rely on it, which probably means that it does a good job.

The second approach requires some mechanism to translate `.dex` files into `.class` files.
[dex2jar](https://github.com/pxb1988/dex2jar) is undoubtedly the most commonly known tool to do this.
However, I stumbled upon [Enjarify](https://github.com/Storyyeller/enjarify).
It advertises to work better for several edge cases:

> It [dex2jar] works reasonably well most of the time, but a lot of obscure features or edge cases will cause it to fail or even silently produce incorrect results. By contrast, Enjarify is designed to work in as many cases as possible, even for code where Dex2jar would fail.

Find more details [in the project's README file](https://github.com/Storyyeller/enjarify/blob/master/README.md).

Enjarify outputs---as the name suggests---a JAR file.
From there, several popular tools can be used to reconstruct Java source code.

To sum up, the following figure illustrates both options we have.

{{< figure src="./decompilation.min.svg" alt="Decompilation process of an APK" caption="We can either use jadx to directly decompile the APK, or we can use Enjarify which enables us to make use of more classical Java decompilers." >}}

## Decompilers

Next, let me show you which decompilers I was particularly interested in, and how to install them.

### CFR

When I saw [the homepage of CFR](https://www.benf.org/other/cfr/) the first time, the project quickly gained my sympathy.
No fancy JavaScript-based interface, just a plain HTML site.
The first sentence on the page immediately caught my eye:

> CFR will decompile modern Java features - up to and including much of Java 9, 12 & 14, but is written entirely in Java 6, so will work anywhere!

Releases can be found on [GitHub](https://github.com/leibnitz27/cfr) and other places, although I'm not sure if it is entirely open-source.
Being a Java project, it compiles conveniently into a single JAR file.

That JAR file can be used as follows:

```bash
java -jar ./cfr.jar "$JARFILE" --outputdir "$OUTDIR"
```

Simple enough!

For larger JAR files I found it to run out of memory.
You can simply adapt the size of the memory allocation pool of the JVM if that happens to you, too.

```bash
java -Xmx4G -jar ./cfr.jar "$JARFILE" --outputdir "$OUTDIR"
```

This example will allow a maximum of 4GB to be allocated.

In the output directory, you will find the decompiled `.java` files, together with a summary of the decompilation.

### Fernflower

Next up is [Fernflower](https://github.com/JetBrains/intellij-community/tree/master/plugins/java-decompiler/engine), which is part of [IntelliJ IDEA](https://www.jetbrains.com/idea/).
Everyone mentions that it is an _analytical_ decompiler (as stated in their project description), but nobody points out what this actually means.
I only found [this Stackoverflow question](https://stackoverflow.com/q/62298929), which unfortunately remains unanswered as of today.

Anyway, since there are no self-contained releases, you need to build it yourself.
As a [Gradle](https://gradle.org/)-based project, you can clone it and then run the following command given that Gradle is installed on your machine.

```bash
cd ./plugins/java-decompiler/engine && gradle jar
```

Here, we first switch our working directory to the root directory of Fernflower.
Then, we instruct Gradle to build the file `./build/libs/fernflower.jar`.

The invocation of Fernflower is similar to that of CFR.

```bash
java -jar ./fernflower.jar "$JARFILE" "$OUTDIR"
```

Among the decompilers described here, this is the only one that outputs the generated `.java` files in a JAR file.
You can easily extract the source files using `unzip`.

### Krakatau

Remember Enjarify from above?
The very same author is also the developer of a decompiler named [Krakatau](https://github.com/Storyyeller/Krakatau).

In contrast to the other projects, this one is written in Python.
And I think this is the reason why it's a bit different from the others.

Let me cite from [the README of the project](https://github.com/Storyyeller/Krakatau/blob/master/README.md).

> Next, make sure you have jars containing defintions (sic!) for any external classes (i.e. libraries) that might be referenced by the jar you are trying to decompile. This includes the standard library classes (i.e. JRT).

And according to the description, these standard library classes come with up to version 8 of Java in the form of the file `rt.jar`.
For later versions, the author provides [jrt-extractor](https://github.com/Storyyeller/jrt-extractor), which can generate this file for us.

So we download that tool and run the following commands.

```bash
cd ./jrt-extractor
javac JRTExtractor.java
java -ea JRTExtractor
```

This should have written a file `rt.jar` inside the directory.

Given this file, we can run Krakatau as follows.

```bash
./Krakatau/decompile.py -out "$OUTDIR" -skip -nauto -path ./jrt-extractor/rt.jar "$JARFILE"
```

Let me refer to the project's GitHub for an explanation of the parameters.
Just note that for any libraries used by your JAR file, Krakatau will require you to add it as a JAR file to the `-path` flag.

### Procyon

The final and fourth decompiler I looked at is [Procyon](https://github.com/mstrobel/procyon).

Even though the project's wiki links to [the downloads over at Bitbucket](https://bitbucket.org/mstrobel/procyon/downloads/), as of the time of writing there are no downloads available.
That's why I tried to compile it myself.

The project also makes use of Gradle for building.
Thus, let's try `gradle jar`.

```text
> Task :Procyon.Reflection:compileJava FAILED
/tmp/procyon-develop/Procyon.Reflection/src/main/java/com/strobel/reflection/emit/TypeBuilder.java:1234: error: cannot find symbol
            _generatedClass = (Class<T>) getUnsafeInstance().defineClass(
                                                            ^
  symbol:   method defineClass(String,byte[],int,int,ClassLoader,ProtectionDomain)
  location: class Unsafe
Note: Some input files use or override a deprecated API.
Note: Recompile with -Xlint:deprecation for details.
1 error


FAILURE: Build failed with an exception.
```

Oh no! This one doesn't compile smoothly.

As a last resort of help I checked if there is anything in the repositories, and luckily---at least on Debian---it's packaged and ready to use.

Once installed, the usage is straightforward.

```bash
procyon -jar "$JARFILE" -o "$OUTDIR"
```

But hold on, if Debian packages Procyon, there must be a way to build it.

A quick search in their bug tracker revealed bug [#909259](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=909259).
The maintainers had the exact same issue!

So let's see how they patched the source to fix it.
The discussion in the bug report links to [this commit diff](https://salsa.debian.org/java-team/procyon/commit/6cc3de7e70d327fa597af22d3da08015aabd1620).
There we can see that a patch was added for compatibility with OpenJDK 11.

I had to tweak the patch as the upstream source has already diverged but finally managed to build it.
If you want to build it yourself, [here is the patch file](./compat.patch) I was successful with.

First, apply the patch, then invoke Gradle to build the project.

```bash
cd ./procyon
patch -p1 < ../compat.patch
gradle fatJar
```

This should create the file `./build/Procyon.Decompiler/libs/procyon-decompiler-1.0-SNAPSHOT.jar`, which is your freshly compiled Procyon decompiler.

## Decompilers to go

You might be wondering: Isn't there an easier way?
And I suppose it depends.

GUI tools like [Bytecode Viewer](https://github.com/Konloch/bytecode-viewer) also use multiple decompilers under the hood and allow you to see their output nicely side-by-side.
But I prefer going the manual way to see what parameters I can adjust.
You have more control over how you launch a decompiler, and you will probably learn new things.

To make it all a bit more accessible, I created a [Docker image](https://hub.docker.com/r/eikendev/java-decompiler) where all four decompilers are available out-of-the-box.
Visit [the GitHub page of the project](https://github.com/eikendev/java-decompiler) to get an idea of how to use it.

Let me note that it also includes the capability to decompile APK files.
As discussed early on, Enjarify is used to convert your APKs to JARs.
It will also decompile your APK files via jadx.

## Conclusion

I kept this post deliberately short and practical.
The goal was to write down my steps for future reference, and I thought it could be useful for others.

If decompilation does not get you anywhere, other tools might be helpful.
Instead of trying to reconstruct the source, maybe it's enough to slightly adjust the behavior of your target.
In that case, you should look into instrumentation as provided by [Frida](https://frida.re/) and [Soot](https://soot-oss.github.io/soot/).

Anyway, that was it.
Thanks for reading!
