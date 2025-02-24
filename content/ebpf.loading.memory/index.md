+++
title = "[eBPF] BPF 실행파일 로딩 과정 분석 (메모리 재배치)"
date = 2021-08-15T00:00:00Z
updated = 2021-08-15T00:00:00Z
draft = false

[taxonomies]
tags = ["eBPF"]
[extra]
toc = true
series = "eBPF"
+++

BPF 는 일반적인 프로그램과 유사한 방식으로 개발하기 때문에 유사한 실행파일 및 메모리 구조를 가지고 있지만, 커널 안에서 제한된 환경으로 실행되기 때문에 로딩(loading)하는 과정은 상당히 다르다. 오늘은 BPF 의 실행파일 및 메모리 구조에 대해 간단히 살펴본 후, 이를 로딩하는 과정에 대해 분석해보도록 하자.

일반적인 실행파일에서 가장 중요한 두 가지는 코드와 데이터이다. 코드는 말그대로 상위언어를 컴파일한 머신코드를 의미하고, 데이터는 실행시 코드가 참조하는 메모리를 의미한다. 데이터는 스택과 힙같이 실행시 메모리가 할당/해제되는 동적 데이터와 전역변수처럼 코드에서 선언되는 정적 데이터로 나뉘는데, 정적 데이터는 실행파일을 로딩할 때 메모리가 할당되고 해당 메모리를 참조하는 코드도 재배치(relocation)된다. 그리고 정적 데이터는 크게 읽기전용 변수, 초기화된 전역변수 그리고 초기화되지 않은 전역변수로 구분되는데, 아래 코드([bcc](https://github.com/iovisor/bcc) 의 [runqslower](https://github.com/iovisor/bcc/blob/master/libbpf-tools/runqslower.bpf.c) 예제코드를 약간 변형한 것이다)를 보면서 조금 더 설명하도록 하겠다.

```c
...
int data0 = 1;
int data1 = 1;
int bss0;
const char rodata0[] = "ebpf";

SEC("tp_btf/sched_switch")
int handle__sched_switch(u64 *ctx)
{
  /* TP_PROTO(bool preempt, struct task_struct *prev,
   *      struct task_struct *next)
   */
  struct task_struct *prev = (struct task_struct *)ctx[1];
  struct task_struct *next = (struct task_struct *)ctx[2];
  struct event event = {};
  u64 *tsp, delta_us;
  long state;
  u32 pid;

  /* ivcsw: treat like an enqueue event and store timestamp */
  if (prev->state == data1)
    trace_enqueue(prev->tgid, prev->pid);

  pid = next->pid;
  ...
}
...
```

우선 읽기전용 변수는 rodata0 처럼 const 로 선언된 전역변수를 의미하고, 해당 메모리에 대한 쓰기 작업을 금지하기 위해 읽기전용의 페이지를 할당받아 사용한다. 그리고 data0 과 data1 같이 초기값을 가지고 있는 전역변수는 초기화된 전역변수로 분류되고, bss0 과 같이 초기값을 가지고 있지 않은 전역변수는 초기화되지 않은 전역변수로 분류된다. 아래는 위의 예제코드를 컴파일한 후 objdump 를 이용해서 섹션 테이블과 심볼 테이블을 출력한 것이다.

```
.output/runqslower.bpf.o:       file format elf64-bpf

architecture: bpfel
start address: 0x0000000000000000

Program Header:

Dynamic Section:
Sections:
Idx Name                        Size     VMA              Type
  0                             00000000 0000000000000000
  1 .text                       00000000 0000000000000000 TEXT
  2 tp_btf/sched_wakeup         000000f8 0000000000000000 TEXT
  3 tp_btf/sched_wakeup_new     000000f8 0000000000000000 TEXT
  4 tp_btf/sched_switch         00000318 0000000000000000 TEXT
  5 .rodata                     00000015 0000000000000000 DATA
  6 .data                       00000008 0000000000000000 DATA
  7 .maps                       00000038 0000000000000000 DATA
  8 license                     00000004 0000000000000000 DATA
  9 .bss                        00000004 0000000000000000 BSS
 10 .BTF                        00005e0c 0000000000000000
 11 .BTF.ext                    0000068c 0000000000000000
 12 .symtab                     000002a0 0000000000000000
 13 .reltp_btf/sched_wakeup     00000030 0000000000000000
 14 .reltp_btf/sched_wakeup_new 00000030 0000000000000000
 15 .reltp_btf/sched_switch     00000080 0000000000000000
 16 .rel.BTF                    000000a0 0000000000000000
 17 .rel.BTF.ext                00000630 0000000000000000
 18 .llvm_addrsig               00000009 0000000000000000
 19 .strtab                     0000017c 0000000000000000

SYMBOL TABLE:
0000000000000000 g     O .bss   0000000000000004 bss0
0000000000000000 g     O .data  0000000000000004 data0
0000000000000004 g     O .data  0000000000000004 data1
0000000000000000 g     F tp_btf/sched_switch    0000000000000318 handle__sched_switch
0000000000000010 g     O .rodata        0000000000000005 rodata0
...
```

리눅스에서 주로 사용하는 ELF 실행파일 구조이고, 용도에 따라 다양한 섹션으로 구성되어 있다. 심볼 테이블을 보면 읽기전용 변수인 rodata0 은 읽기전용 데이터 섹션인 .rodata 에 속해있고, 초기화된 전역변수인 data0 과 data1 은 .data 섹션에, 그리고 초기화되지 않은 전역변수인 bss0 은 .bss 섹션에 포함되어 있는 것을 볼 수 있다. 여기서 .data 섹션과 .bss 섹션의 차이점은 .data 섹션은 실제 초기값들을 실행파일 안에 포함하고 있지만, .bss 섹션은 초기값이 없기 때문에 실행파일 안은 비어있고 로딩 시에 메모리를 할당받은 후 0 으로 초기화한다.

일반적인 프로그램을 실행할 때는 .data, .rodata, 그리고 .bss 섹션까지 프로세스의 가상 주소 공간에 필요한 메모리를 할당받아 실행파일로부터 필요한 데이터를 복사한 후 로딩 작업을 마무리하지만, BPF 는 커널 주소 공간에서 실행되기 때문에 강도 높은 안정성과 보안성을 위해 다른 방식으로 로딩 작업을 진행한다. 이후 자세한 로딩 과정은 [libbpf](https://github.com/torvalds/linux/blob/master/tools/lib/bpf/libbpf.c)를 기준으로 설명하도록 하겠다.

우선, BPF 실행파일의 .data, .rodata, 그리고 .bss 섹션을 각각 BPF 맵(map)으로 만든다. BPF 맵은 사용자 코드와 BPF 코드가 데이터를 공유하는 가장 보편적인 방식으로, .data 와 .rodata 섹션은 BPF 맵을 만든 다음 실행파일의 각 섹션에 있는 데이터를 복사하고, .bss 섹션은 0 으로 초기화되어 있는 BPF 맵을 만든다. 그리고 각 섹션에 있는 변수를 참조하는 코드를 재배치해야 하는데, 우선 앞의 예제에서 data1 변수를 참조하는 부분의 코드를 살펴보자.

```
0000000000000000 <handle__sched_switch>:
       0:       bf 16 00 00 00 00 00 00 r6 = r1
       1:       79 68 10 00 00 00 00 00 r8 = *(u64 *)(r6 + 16)
       2:       79 67 08 00 00 00 00 00 r7 = *(u64 *)(r6 + 8)
       3:       b7 01 00 00 00 00 00 00 r1 = 0
       4:       7b 1a e8 ff 00 00 00 00 *(u64 *)(r10 - 24) = r1
       5:       7b 1a e0 ff 00 00 00 00 *(u64 *)(r10 - 32) = r1
       6:       7b 1a d8 ff 00 00 00 00 *(u64 *)(r10 - 40) = r1
       7:       7b 1a d0 ff 00 00 00 00 *(u64 *)(r10 - 48) = r1
       8:       7b 1a c8 ff 00 00 00 00 *(u64 *)(r10 - 56) = r1
       9:       7b 1a c0 ff 00 00 00 00 *(u64 *)(r10 - 64) = r1
      10:       79 71 10 00 00 00 00 00 r1 = *(u64 *)(r7 + 16)
      11:       18 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 r2 = 0 ll
      13:       61 22 00 00 00 00 00 00 r2 = *(u32 *)(r2 + 0)
      14:       67 02 00 00 20 00 00 00 r2 <<= 32
      15:       c7 02 00 00 20 00 00 00 r2 s>>= 32
      16:       5d 21 1c 00 00 00 00 00 if r1 != r2 goto +28 <LBB2_7>
      ...
```

위의 (11:) 명령어는 data1 에 있는 값을 r2 레지스터로 복사하는 부분인데, opcode 와 레지스터 정보만 있고 다른 모든 값은 0 으로 채워져있다. 이는 커널에 BPF 코드를 넘기기 전에 아래의 재배치 정보를 이용하여 필요한 다른 값으로 채워진다.

```
RELOCATION RECORDS FOR [tp_btf/sched_switch]:
OFFSET           TYPE                     VALUE
0000000000000058 R_BPF_64_64              data1
00000000000000a8 R_BPF_64_64              targ_tgid
00000000000000e8 R_BPF_64_64              targ_pid
0000000000000148 R_BPF_64_64              start
...
```

위의 재배치 목록의 첫 번째 항목은 tp_btf/sched_switch 섹션(handle\_\_sched_switch 함수)의 오프셋이 0x58 인, (11:) 명령어에서 data1 변수를 참조하고 있다는 의미이다. 이 명령어는 보는 것처럼 8 바이트씩 2 개의 명령어로 구성되어 있는데, 재배치 과정에서 첫 번째 명령어에는 data1 변수가 속해있는 섹션(.data)으로 만들어진 BPF 맵의 파일디스크립터를 집어넣고, 두 번째 명령어에는 data1 변수가 속해있는 섹션에서의 오프셋을 집어넣는다. 아래는 필자가 사용 중인 서버에서 앞의 예제를 실행한 프로세스의 파일디스크립터 정보를 출력한 것이다.

```bash
/proc/4812/fd# ls -lh
lrwx------ 1 root root 64 Sep 16 05:13 0 -> /dev/tty1
lrwx------ 1 root root 64 Sep 16 05:13 1 -> /dev/tty1
lrwx------ 1 root root 64 Sep 16 05:56 10 -> anon_inode:bpf-prog
lrwx------ 1 root root 64 Sep 16 05:56 11 -> anon_inode:bpf-prog
lr-x------ 1 root root 64 Sep 16 05:56 12 -> anon_inode:bpf_link
lr-x------ 1 root root 64 Sep 16 05:56 13 -> anon_inode:bpf_link
lr-x------ 1 root root 64 Sep 16 05:56 14 -> anon_inode:bpf_link
lrwx------ 1 root root 64 Sep 16 05:56 15 -> 'anon_inode:[eventpoll]'
lrwx------ 1 root root 64 Sep 16 05:56 16 -> 'anon_inode:[perf_event]'
lrwx------ 1 root root 64 Sep 16 05:56 17 -> 'anon_inode:[perf_event]'
lrwx------ 1 root root 64 Sep 16 05:56 18 -> 'anon_inode:[perf_event]'
lrwx------ 1 root root 64 Sep 16 05:13 2 -> /dev/tty1
lr-x------ 1 root root 64 Sep 16 05:13 3 -> anon_inode:btf
lrwx------ 1 root root 64 Sep 16 05:56 4 -> anon_inode:bpf-map
lrwx------ 1 root root 64 Sep 16 05:56 5 -> anon_inode:bpf-map
lrwx------ 1 root root 64 Sep 16 05:13 6 -> anon_inode:bpf-map
lrwx------ 1 root root 64 Sep 16 05:13 7 -> anon_inode:bpf-map
lrwx------ 1 root root 64 Sep 16 05:56 8 -> anon_inode:bpf-map
lrwx------ 1 root root 64 Sep 16 05:56 9 -> anon_inode:bpf-prog
```

해당 프로세스의 파일디스크립터 목록 중 6 번이 .data 섹션에 해당하는 BPF 맵이기 때문에 (11:) 명령어의 첫 번째 명령어에는 6 이라는 값이 채워지고, 심볼 테이블을 보면 data1 변수는 .data 섹션에서 오프셋이 4 이기 때문에 (11:) 명령어의 두 번째 명령어에는 4 라는 값이 채워진다. 이러한 재배치 과정을 통해 나온 BPF 코드는 아래와 같다.

```
$ bpftool map
8105: array  name runqslow.data  flags 0x400
	key 4B  value 8B  max_entries 1  memlock 4096B
	btf_id 944
8106: array  name runqslow.rodata  flags 0x480
	key 4B  value 21B  max_entries 1  memlock 4096B
	btf_id 944  frozen
8107: array  name runqslow.bss  flags 0x400
	key 4B  value 4B  max_entries 1  memlock 4096B
	btf_id 944

$ bpftool prog dump xlated id 62928
int handle__sched_switch(u64 * ctx):
; int handle__sched_switch(u64 *ctx)
   0: (bf) r6 = r1
; struct task_struct *next = (struct task_struct *)ctx[2];
   1: (79) r8 = *(u64 *)(r6 +16)
; struct task_struct *prev = (struct task_struct *)ctx[1];
   2: (79) r7 = *(u64 *)(r6 +8)
   3: (b7) r1 = 0
; if (prev->state == data1)
  10: (79) r1 = *(u64 *)(r7 +24)
; if (prev->state == data1)
  11: (18) r2 = map[id:8105][0]+4
  13: (61) r2 = *(u32 *)(r2 +0)
  14: (67) r2 <<= 32
  15: (c7) r2 s>>= 32
; if (prev->state == data1)
  16: (5d) if r1 != r2 goto pc+20
  ...
```

우선 현재 사용 중인 BPF 맵 목록을 보면 각 섹션(.data, .rodata, .bss)에 해당하는 BPF 맵에 대한 정보를 볼 수 있다. 각각의 BPF 맵은 1개의 요소만을 가지는 arraymap 형태로 만들어지고, 배열 요소의 크기는 각 섹션의 크기와 동일하다. 그리고 위의 커널에 로딩된 BPF 코드를 살펴보면, (11:) 명령어에서 파일디스크립터(6)에 해당하는 BPF 맵의 ID(8105)와 첫 번째 배열 요소를 나타내는 인덱스(0), 그리고 해당 배열 요소에서의 오프셋(4)을 볼 수 있다.

이러한 재배치 작업이 끝난 후, 커널에서는 파일디스크립터와 오프셋을 이용하여 실제 메모리 주소를 구한 다음, (11:) 명령어의 첫 번째 명령어에 해당 메모리 주소의 하위 32 비트 주소를 저장하고, 두 번째 명령어에 상위 32 비트 주소를 저장한다. 마지막으로 BPF 코드를 실제 동작 가능한 머신코드(x86)로 JIT(Just-In-Time) 컴파일한 결과물은 아래와 같다.

```
$ bpftool prog dump jited id 62928
int handle__sched_switch(u64 * ctx):
bpf_prog_474ea3c284cc8478_handle__sched_switch:
; int handle__sched_switch(u64 *ctx)
   0:	nopl   0x0(%rax,%rax,1)
   5:	xchg   %ax,%ax
   7:	push   %rbp
   8:	mov    %rsp,%rbp
   b:	sub    $0x40,%rsp
  12:	push   %rbx
  13:	push   %r13
  15:	push   %r14
  17:	push   %r15
  19:	mov    %rdi,%rbx
; struct task_struct *next = (struct task_struct *)ctx[2];
  1c:	mov    0x10(%rbx),%r14
; struct task_struct *prev = (struct task_struct *)ctx[1];
  20:	mov    0x8(%rbx),%r13
  24:	xor    %edi,%edi
; if (prev->state == data1)
  3e:	test   %r13,%r13
  41:	jne    0x0000000000000047
  43:	xor    %edi,%edi
  45:	jmp    0x000000000000004b
  47:	mov    0x18(%r13),%rdi
; if (prev->state == data1)
  4b:	movabs $0xffffba9640e6a004,%rsi
  55:	mov    0x0(%rsi),%esi
  58:	shl    $0x20,%rsi
  5c:	sar    $0x20,%rsi
; if (prev->state == data1)
  60:	cmp    %rsi,%rdi
  63:	jne    0x00000000000000cf
```

위의 (4b:) 명령어를 보면 x86 CPU 에서 r2 레지스터에 해당하는 rsi 레지스터가 할당되어 있는 것과 재배치 작업이 끝난 data1 의 메모리 주소가 들어가 있는 것을 볼 수 있다. 여기까지 BPF 코드에서 전역변수로 선언된 data1 에 접근하기 위해 필요한 재배치 과정을 살펴보았다.
