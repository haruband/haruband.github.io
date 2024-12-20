+++
title = "[eBPF] BPF 실행파일 로딩 과정 분석 (서브프로그램)"
date = 2021-08-19T00:00:00Z
updated = 2021-08-19T00:00:00Z
draft = false

[taxonomies]
tags = ["eBPF"]
[extra]
toc = true
series = "eBPF"
+++

BPF 는 일반적으로 하나의 함수(메인함수)가 하나의 섹션이 되고, 하나의 섹션이 하나의 프로그램이 된다. 그래서 커널에서 해당 프로그램을 실행할 때는 프로그램의 시작 위치가 메인함수의 시작 위치이기 때문에 간단히 처음부터 실행하면 된다. 하지만 아래와 같이 메인함수에서 공통함수를 호출하는 경우처럼 두 개 이상의 함수가 필요한 경우에는 프로그램의 시작 위치를 어떻게 보장할까? 메인함수를 무조건 프로그램의 시작 위치에 배치할까? 아니면 메인함수가 어디에 위치하든 프로그램의 시작 위치를 메인함수의 시작 위치로 지정할까? BPF 는 이를 해결하기 위해 서브프로그램이라는 기능을 제공하고 있고, 오늘은 이에 대해 살펴보도록 하자.

```c
static int probe_entry(struct pt_regs *ctx, struct file *file, size_t count, enum op op)
{
  __u64 pid_tgid = bpf_get_current_pid_tgid();
  __u32 pid = pid_tgid >> 32;
  __u32 tid = (__u32)pid_tgid;

  ...

  return 0;
}

SEC("kprobe/vfs_read")
int BPF_KPROBE(vfs_read_entry, struct file *file, char *buf, size_t count, loff_t *pos)
{
  return probe_entry(ctx, file, count, READ);
}

SEC("kprobe/vfs_write")
int BPF_KPROBE(vfs_write_entry, struct file *file, const char *buf, size_t count, loff_t *pos)
{
  return probe_entry(ctx, file, count, WRITE);
}
```

위의 코드는 [bcc](https://github.com/iovisor/bcc) 의 [filetop](https://github.com/iovisor/bcc/blob/master/libbpf-tools/filetop.bpf.c) 예제코드이다. 해당 예제는 vfs_read 와 vfs_write 커널함수에서 각각 사용할 두 개의 BPF 메인함수와 두 개의 함수에서 사용하는 공통함수(probe_entry)로 구성되어 있다. 이를 컴파일한 결과는 아래와 같다.

```
Disassembly of section .text:

0000000000000000 <probe_entry>:
       0:       7b 3a b8 ff 00 00 00 00 *(u64 *)(r10 - 72) = r3
       1:       7b 2a c0 ff 00 00 00 00 *(u64 *)(r10 - 64) = r2
       2:       7b 1a c8 ff 00 00 00 00 *(u64 *)(r10 - 56) = r1
       3:       85 00 00 00 0e 00 00 00 call 14
       4:       bf 08 00 00 00 00 00 00 r8 = r0
       5:       b7 01 00 00 00 00 00 00 r1 = 0
       6:       7b 1a e0 ff 00 00 00 00 *(u64 *)(r10 - 32) = r1
       7:       7b 1a d8 ff 00 00 00 00 *(u64 *)(r10 - 40) = r1
       8:       7b 1a d0 ff 00 00 00 00 *(u64 *)(r10 - 48) = r1
       9:       bf 89 00 00 00 00 00 00 r9 = r8
      10:       77 09 00 00 20 00 00 00 r9 >>= 32
      11:       18 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 r1 = 0 ll
      13:       61 12 00 00 00 00 00 00 r2 = *(u32 *)(r1 + 0)
      14:       15 02 02 00 00 00 00 00 if r2 == 0 goto +2 <LBB2_2>
      15:       61 11 00 00 00 00 00 00 r1 = *(u32 *)(r1 + 0)
      16:       5d 91 7c 00 00 00 00 00 if r1 != r9 goto +124 <LBB2_14>
      ...

Disassembly of section kprobe/vfs_read:

0000000000000000 <vfs_read_entry>:
       0:       79 12 60 00 00 00 00 00 r2 = *(u64 *)(r1 + 96)
       1:       79 11 70 00 00 00 00 00 r1 = *(u64 *)(r1 + 112)
       2:       b7 03 00 00 00 00 00 00 r3 = 0
       3:       85 10 00 00 ff ff ff ff call -1
       4:       b7 00 00 00 00 00 00 00 r0 = 0
       5:       95 00 00 00 00 00 00 00 exit

Disassembly of section kprobe/vfs_write:

0000000000000000 <vfs_write_entry>:
       0:       79 12 60 00 00 00 00 00 r2 = *(u64 *)(r1 + 96)
       1:       79 11 70 00 00 00 00 00 r1 = *(u64 *)(r1 + 112)
       2:       b7 03 00 00 01 00 00 00 r3 = 1
       3:       85 10 00 00 ff ff ff ff call -1
       4:       b7 00 00 00 00 00 00 00 r0 = 0
       5:       95 00 00 00 00 00 00 00 exit
```

위의 오브젝트를 보면 메인함수는 각각의 섹션에 위치해있지만 공통함수는 .text 섹션에 위치해있는 것을 볼 수 있다. (함수 선언 앞에 섹션을 지정하지 않으면 해당 함수는 기본적으로 .text 섹션에 위치하게 된다.) 일반적으로 BPF 프로그램을 로딩할 때는 하나의 특정 섹션을 지정해서 사용하는데, 위와 같이 메인함수에서 호출하는 함수가 다른 섹션에 존재할 때는 어떻게 동작하는 것일까? 이 질문에 대한 해답은 [libbpf](https://github.com/torvalds/linux/blob/master/tools/lib/bpf/libbpf.c)를 기준으로 설명하도록 하겠다. 우선 아래 재배치 목록을 살펴보자.

```
RELOCATION RECORDS FOR [kprobe/vfs_read]:
OFFSET           TYPE                     VALUE
0000000000000018 R_BPF_64_32              .text

RELOCATION RECORDS FOR [kprobe/vfs_write]:
OFFSET           TYPE                     VALUE
0000000000000018 R_BPF_64_32              .text
```

위의 재배치 목록 중 두 번째 항목은 kprobe/vfs_write 섹션의 0x18 오프셋에 해당하는 (3:) 명령어에서 .text 섹션을 참조한다는 의미이다. 그리고 kprobe/vfs_write 섹션의 (3:) 명령어의 인자를 보면 -1 (0xffffffff) 인 값인데, 이는 해당 섹션(.text)에서 -1 에 1 을 더한 위치를 의미한다. 즉, (3:) 명령어는 .text 섹션의 0x0 오프셋을 호출(call)하라는 뜻이다. 이러한 재배치 정보를 이용하여 실제 커널에 전달할 BPF 코드를 작성하는 과정은 다음과 같다.

```
Symbol table '.symtab' contains 20 entries:
   Num:    Value          Size Type    Bind   Vis       Ndx Name
     0: 0000000000000000     0 NOTYPE  LOCAL  DEFAULT   UND
     1: 00000000000003c8     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_10
     2: 00000000000003d0     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_11
     3: 0000000000000430     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_13
     4: 0000000000000468     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_14
     5: 0000000000000088     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_2
     6: 0000000000000138     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_4
     7: 00000000000003b0     0 NOTYPE  LOCAL  DEFAULT     1 LBB2_8
     8: 0000000000000000  1136 FUNC    LOCAL  DEFAULT     1 probe_entry
     9: 0000000000000000  4160 OBJECT  LOCAL  DEFAULT     7 zero_value
    10: 0000000000000000     0 SECTION LOCAL  DEFAULT     1 .text
    11: 0000000000000000     0 SECTION LOCAL  DEFAULT     2 kprobe/vfs_read
    12: 0000000000000000     0 SECTION LOCAL  DEFAULT     3 kprobe/vfs_write
    13: 0000000000000000     0 SECTION LOCAL  DEFAULT     7 .bss
    14: 0000000000000000    13 OBJECT  GLOBAL DEFAULT     5 LICENSE
    15: 0000000000000000    32 OBJECT  GLOBAL DEFAULT     6 entries
    16: 0000000000000004     1 OBJECT  GLOBAL DEFAULT     4 regular_file_only
    17: 0000000000000000     4 OBJECT  GLOBAL DEFAULT     4 target_pid
    18: 0000000000000000    48 FUNC    GLOBAL DEFAULT     2 vfs_read_entry
    19: 0000000000000000    48 FUNC    GLOBAL DEFAULT     3 vfs_write_entry
```

일단 심볼 테이블을 이용하여 코드를 포함하고 있는 섹션에 있는 함수들을 모두 프로그램으로 등록한다. 위의 심볼 테이블을 보면, kprobe/vfs_read 섹션에 있는 vfs_read_entry 함수를, kprobe/vfs_write 섹션에 있는 vfs_write_entry 함수를, 그리고 .text 섹션에 있는 probe_entry 함수를 각각 프로그램으로 등록한다. 이때 .text 섹션에 있는 함수들은 모두 서브프로그램으로 등록이 되는데, 이는 커널에 직접 로딩되는 프로그램이 아니고, 다른 프로그램에서 호출해서 사용하는 프로그램이라는 의미이다. 그리고 나머지 커널에 직접 로딩되는 프로그램들은 앞의 재배치 정보(.text 섹션의 0x0 오프셋)와 프로그램 목록(.text 섹션의 0x0 오프셋에 해당하는 probe_entry 프로그램)을 이용하여 메인함수에서 호출하는 함수를 해당 프로그램의 뒤쪽에 추가하고, 해당 함수를 호출하는 명령어의 인자를 적절한 값으로 수정한다. 이 과정은 메인함수에서 호출한 함수에서도 다른 함수를 호출할 수 있기 때문에 재귀적으로 일어난다. 아래는 커널에 로딩된 프로그램(BPF 코드)을 덤프한 것이다.

```
$ bpftool prog dump xlated id 17
int vfs_write_entry(struct pt_regs * ctx):
; int BPF_KPROBE(vfs_write_entry, struct file *file, const char *buf, size_t count, loff_t *pos)
   0: (79) r2 = *(u64 *)(r1 +96)
   1: (79) r1 = *(u64 *)(r1 +112)
; return probe_entry(ctx, file, count, WRITE);
   2: (b7) r3 = 1
   3: (85) call pc+2#bpf_prog_14ee69a88d05505b_F
; int BPF_KPROBE(vfs_write_entry, struct file *file, const char *buf, size_t count, loff_t *pos)
   4: (b7) r0 = 0
   5: (95) exit
int probe_entry(struct pt_regs * ctx, struct file * file, size_t count, enum op op):
; static int probe_entry(struct pt_regs *ctx, struct file *file, size_t count, enum op op)
   6: (7b) *(u64 *)(r10 -72) = r3
   7: (7b) *(u64 *)(r10 -64) = r2
   8: (7b) *(u64 *)(r10 -56) = r1
; __u64 pid_tgid = bpf_get_current_pid_tgid();
   9: (85) call bpf_get_current_pid_tgid#133744
  10: (bf) r8 = r0
  11: (b7) r1 = 0
; struct file_id key = {};
  12: (7b) *(u64 *)(r10 -32) = r1
  13: (7b) *(u64 *)(r10 -40) = r1
  14: (7b) *(u64 *)(r10 -48) = r1
; __u32 pid = pid_tgid >> 32;
  15: (bf) r9 = r8
  16: (77) r9 >>= 32
```

위의 코드를 보면, 맨 앞 부분에 메인함수가 위치해있고, 바로 이어서 공통함수(probe_entry)가 위치해있는 것을 볼 수 있다. 그리고 공통함수를 호출하는 (3:) 명령어를 보면, 공통함수의 시작 위치가 (6:) 명령어이기 때문에 다음 명령어(4:)의 주소값(Program Counter)을 기준으로 2 를 더한 위치를 호출하는 것을 볼 수 있다. 마지막으로 BPF 코드를 실제 동작 가능한 머신코드(x86)로 JIT(Just-In-Time) 컴파일한 결과물은 아래와 같다.

```
$ bpftool prog dump jited id 17
int vfs_write_entry(struct pt_regs * ctx):
bpf_prog_f3dfb13428230191_F:
; int BPF_KPROBE(vfs_write_entry, struct file *file, const char *buf, size_t count, loff_t *pos)
   0:	nopl   0x0(%rax,%rax,1)
   5:	xchg   %ax,%ax
   7:	push   %rbp
   8:	mov    %rsp,%rbp
   b:	mov    0x60(%rdi),%rsi
   f:	mov    0x70(%rdi),%rdi
; return probe_entry(ctx, file, count, WRITE);
  13:	mov    $0x1,%edx
  18:	callq  0x00000000000020c8
; int BPF_KPROBE(vfs_write_entry, struct file *file, const char *buf, size_t count, loff_t *pos)
  1d:	xor    %eax,%eax
  1f:	leaveq
  20:	retq

int probe_entry(struct pt_regs * ctx, struct file * file, size_t count, enum op op):
bpf_prog_41cced38f6644d9a_F:
; static int probe_entry(struct pt_regs *ctx, struct file *file, size_t count, enum op op)
   0:	nopl   0x0(%rax,%rax,1)
   5:	xchg   %ax,%ax
   7:	push   %rbp
   8:	mov    %rsp,%rbp
   b:	sub    $0x48,%rsp
  12:	push   %rbx
  13:	push   %r13
  15:	push   %r14
  17:	push   %r15
  19:	mov    %rdx,-0x48(%rbp)
  1d:	mov    %rsi,-0x40(%rbp)
  21:	mov    %rdi,-0x38(%rbp)
; __u64 pid_tgid = bpf_get_current_pid_tgid();
  25:	callq  0xffffffffd3e3693c
  2a:	mov    %rax,%r14
  2d:	xor    %edi,%edi
```

리눅스 커널에서는 앞의 BPF 코드를 한번에 컴파일하지 않고, 메인함수와 공통함수를 서브프로그램으로 나눈 다음 각각 컴파일한다. 그리고 메인함수(vfs_write_entry)에서 공통함수(probe_entry)를 호출하는 명령어(18:)를 보면, 다음 명령어(0x1d:)의 위치에서 공통함수를 JIT 컴파일한 결과물이 저장된 메모리 위치까지의 거리(오프셋)를 이용하여 호출하는 것을 볼 수 있다. 여기까지 BPF 코드에서 다른 함수를 호출하는 과정을 살펴보았다.
