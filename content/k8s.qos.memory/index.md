+++
title = "[K8S] 메모리 QoS 지원 분석"
date = 2021-04-22T00:00:00Z
updated = 2021-04-22T00:00:00Z
draft = false

[taxonomies]
tags = ["K8S", "Kubernetes"]
[extra]
toc = true
series = "K8S"
+++

쿠버네티스처럼 다양한 워크로드를 제한된 자원을 이용하여 효율적으로 실행해야하는 플랫폼에서는 QoS 의 역할과 보장이 매우 중요하다. 특히 성능에 큰 영향을 주는 메모리 관리는 무엇보다 중요하며, 최근 CGroupV2 와 스왑 지원으로 메모리 관리 기능이 점점 더 강화되고 있다. 오늘은 이러한 기능들을 이용하여 쿠버네티스가 어떻게 메모리를 관리하는지 자세히 살펴보도록 하자. (리눅스 커널이 제공하는 메모리 관리의 핵심적인 기능인 페이징과 스왑에 대해 궁금하신 분은 [관련 글](https://haruband.github.io/k8s-memory-swap)을 먼저 읽어보기 바란다.)

QoS 의 가장 핵심적인 기능은 주어진 만큼만 자원을 사용토록 하는 것이다. 이는 CPU 같이 압축(compressible)이 쉬운 자원은 문제가 안 되지만, 메모리처럼 압축이 어려운 자원은 생각보다 고려해야 할 사항이 많다. **메모리가 압축이 어려운 대표적인 이유는 1) 페이지 캐시처럼 여러 프로세스가 공유하는, 소유자가 애매한 경우가 많고, 2) 커널 메모리처럼 반환이 불가능하거나, 페이지 캐시나 익명 페이지처럼 반환이 어려운 경우가 많기 때문이다.** 이러한 문제들로 인해 쿠버네티스에서 CGroupV2 와 스왑의 역할이 더욱 중요해지고 있다.

## 어떻게 프로세스가 사용하는 메모리를 제한하는가?

쿠버네티스는 리눅스 커널이 제공하는 CGroupV2 를 이용하여 프로세스가 속해있는 CGROUP 단위로 메모리 사용량을 제한하고 있다. 리눅스 커널이 프로세스의 메모리 사용량을 제한하는 핵심적인 방법은 메모리를 할당할 때마다 사용량을 확인해서 필요하면 바로 반환하는 것이다. 아래는 페이징을 지원하는 리눅스 커널에서 페이지 폴트가 발생할 때 새로운 페이지를 할당받는 과정을 간단히 정리한 것이다. (이외에도 페이지를 할당받는 방법이 있긴 하지만, 대부분은 아래와 같은 방식으로 페이지를 할당받는다.)

- 새로운 페이지를 할당받는다. (익명 페이지 혹은 페이지 캐시)
- 프로세스가 속해있는 CGROUP 의 메모리 사용량을 확인한다.
- 메모리 초과 사용시, 초과된 메모리를 모두 반환한다. (몇 가지 정책(LRU, swappiness, ...)에 의해 선택된 페이지를 반환한다.)
- 메모리 반환 실패시, 해당 프로세스는 종료(OOM)된다.

리눅스 커널에서 초과된 메모리를 반환하는 것이 쉬운 일은 아니지만, 위와 같이 굉장히 간단하고 강력한 수단으로 메모리 사용량을 제한하고 있다.

## 어떻게 시스템이 사용하는 메모리를 제한하는가?

프로세스의 메모리 사용량을 아무리 잘 제한하더라도 시스템 전체의 메모리 사용량은 한도를 초과할 수 있다. **그래서 이를 해결하기 위해 리눅스 커널은 1) 필요할 때마다 메모리 접근 시점을 기반으로 하는 LRU 정책을 이용하여 메모리를 반환하고, 2) 전체 메모리 사용량이 한도를 초과하면 우선순위를 계산해서 특정 프로세스 혹은 특정 CGROUP 을 종료시킨다. 또한, 쿠버네티스도 전체 메모리 사용량이 한도를 초과했을 때 자체적으로 우선순위를 계산해서 특정 파드를 종료시킨다.**

## 어떻게 프로세스가 사용 중인 메모리를 반환하는가?

프로세스가 사용 중인 메모리를 강제로 반환하는 것은 쉬운 일이 아니다. **파일에 대한 빠른 접근을 위해 사용되는 페이지 캐시는 수정된 내용이 없으면 추가적인 작업없이 바로 반환할 수 있지만, 수정된 내용이 있으면 반드시 원본 파일에 해당 내용을 반영(writeback)한 후 반환할 수 있다. 스택이나 힙을 위해 사용되는 익명 페이지는 스왑 기능이 없으면 반환이 아예 불가능하며, 스왑 기능이 있으면 익명 페이지를 위한 스왑 공간을 할당받고 페이지 내용을 저장한 후 반환할 수 있다.** 그리고 페이지 캐시의 수정된 내용을 반영(writeback)하거나 익명 페이지를 스왑에 저장하기 위해서는 디스크에 대한 쓰기 작업이 필요하기 때문에 예상치 못한 문제가 발생할 수도 있고, 프로세스의 메모리 사용 패턴에 따라 메모리를 반환하는 것이 성능에 큰 영향을 줄 수도 있다.

간단히 몇 가지 실험을 통해 최대 메모리 사용량이 페이지 캐시와 익명 페이지에 어떤 영향을 주는지 살펴보도록 하자.

우선 페이지 캐시부터 살펴보도록 하자. 아래는 1G 메모리를 사용할 수 있는 프로세스가 4G 파일을 두 번째 읽을 때의 상황이다. (페이지 캐시의 효과를 보려면 읽은 파일을 다시 읽어야 한다.)

```bash
# cat /sys/fs/cgroups/.../memory.stat
anon=59322368 file=1003139072
# cat /sys/fs/cgroups/.../io.stat
rbytes=5329436672 wbytes=5749862400 rios=42989 wios=350636 dbytes=0 dios=0

$ md5sum file
real    0m29.512s
user    0m11.805s
sys     0m2.344s

# cat /sys/fs/cgroups/.../memory.stat
anon=59322368 file=1003167744
# cat /sys/fs/cgroups/.../io.stat
rbytes=9624522752 wbytes=5749862400 rios=59394 wios=350636 dbytes=0 dios=0
```

4G 파일을 이미 순차적으로 한번 읽었지만 1G 메모리만 사용할 수 있기 때문에 마지막에 읽은 1G 메모리만 페이지 캐시에 남아있다. 그래서 해당 파일을 다시 순차적으로 읽을 때는 파일 전체를 다시 읽을 수 밖에 없기 때문에 성능이 매우 떨어질 수 밖에 없다. 하지만, 해당 프로세스가 8G 메모리를 사용할 수 있다면 상황은 아래와 같이 많이 다를 것이다.

```bash
# cat /sys/fs/cgroups/.../memory.stat
anon=59346944 file=4297256960
# cat /sys/fs/cgroups/.../io.stat
rbytes=4326559744 wbytes=4294987776 rios=20574 wios=4135 dbytes=0 dios=0

$ md5sum file
real    0m6.500s
user    0m5.949s
sys     0m0.544s

# cat /sys/fs/cgroups/.../memory.stat
anon=59346944 file=4297871360
# cat /sys/fs/cgroups/.../io.stat
rbytes=4327174144 wbytes=4294987776 rios=20724 wios=4135 dbytes=0 dios=0
```

4G 파일을 처음 읽고나면 4G 메모리가 모두 페이지 캐시에 남아있기 때문에 두번 째 읽을 때는 파일을 다시 읽을 필요가 없으므로 성능이 상대적으로 매우 좋을 수 밖에 없다.

다음은 익명 페이지를 살펴보도록 하자. 아래는 스왑 기능이 없을때 1G 메모리를 사용할 수 있는 프로세스가 4G 힙을 사용할 때의 상황이다.

```bash
$ stress-ng --vm 1 --vm-bytes 4096M --vm-keep --vm-hang 0

# journalctl -k -f
Dec 17 01:54:19 node1 kernel: Memory cgroup out of memory: Killed process 1158401 (stress-ng-vm) total-vm:4240664kB, anon-rss:984988kB, file-rss:768kB, shmem-rss:32kB, UID:0 pgtables:2004kB oom_score_adj:1000
Dec 17 01:54:19 node1 kernel: oom_reaper: reaped process 1158401 (stress-ng-vm), now anon-rss:0kB, file-rss:0kB, shmem-rss:32kB
```

부족한 메모리를 반환해서 사용할 수 없기 때문에 리눅스 커널에 의해 해당 프로세스는 바로 종료된다. 하지만, 스왑 기능이 있다면 상황은 아래와 같을 것이다.

```bash
$ stress-ng --vm 1 --vm-bytes 4096M --vm-keep --vm-hang 0

# cat /sys/fs/cgroups/.../io.stat
rbytes=18944565248 wbytes=8100360192 rios=173696 wios=924488 dbytes=0 dios=0
rbytes=18953256960 wbytes=8375779328 rios=175064 wios=991729 dbytes=0 dios=0
rbytes=18953256960 wbytes=8481820672 rios=175064 wios=1017618 dbytes=0 dios=0
rbytes=18953256960 wbytes=8700641280 rios=175064 wios=1071041 dbytes=0 dios=0
rbytes=18953256960 wbytes=8781262848 rios=175064 wios=1090724 dbytes=0 dios=0
rbytes=18953256960 wbytes=8872636416 rios=175064 wios=1113032 dbytes=0 dios=0
rbytes=18953256960 wbytes=8979091456 rios=175064 wios=1139022 dbytes=0 dios=0
rbytes=18953256960 wbytes=9043832832 rios=175064 wios=1154828 dbytes=0 dios=0
rbytes=18953256960 wbytes=9128165376 rios=175064 wios=1175417 dbytes=0 dios=0
```

메모리가 부족할 때마다 익명 페이지를 반환해서 사용하기 때문에 프로세스가 종료되진 않지만, 스왑 공간에 대한 디스크 쓰기 작업이 꾸준히 발생하는 것을 볼 수 있다.

## 스왑 기능이 반드시 필요한가?

스왑 기능이 없다면, 반복적으로 사용되지 않는 스택이나 힙이 많을때는 프로세스가 종료될 때까지 많은 메모리가 낭비될 수 있고, 프로세스가 사용하는 스택이나 힙의 크기를 예측하기 힘들때는 예상치 못하게 프로세스가 종료될 수 있다. 그래서 모든 프로세스가 스왑 기능이 필요한 것은 아니지만, 스왑이 반드시 필요한 프로세스도 많기 때문에 선택적으로 사용할 수 있어야 한다.

## 페이지 캐시는 누구의 소유인가?

스택과 힙에 사용되는 익명 페이지는 해당 프로세스의 소유이지만, 페이지 캐시는 누구나 사용할 수 있기 때문에 어떤 프로세스의 소유인지가 애매하다. 현재 리눅스 커널은 간단히 페이지 캐시에 처음 접근해서 페이지를 할당받은 프로세스의 소유로 하고 있다. 그래서 페이지 캐시를 처음 접근할수록 불리할 수도 있다. 왜냐하면 다른 프로세스도 사용하는데 해당 프로세스의 메모리 사용량만 줄어들기 때문이다.

## 주의해야할 사항

높은 우선순위를 가진 파드도 커널에 의해 종료될 수 있다. 시스템 전체의 메모리가 부족해서 실행되는 커널이나 쿠버네티스의 OOM 에 의해 종료되진 않겠지만, 스왑 기능 없이 스택이나 힙을 과도하게 사용한다면 언제든 종료될 수 있다. 그래서 우선순위를 높이기 위해 최대 메모리 사용량을 명시할 때는 신중히 설정해야 한다.

높은 우선순위를 가진 파드가 낮은 우선순위를 가진 파드에 의해 방해받을 수 있다. 리눅스 커널은 여러 가지 상황에서 일부 메모리를 반환하기 시작하는데, 이때 루트 CGROUP 부터 PRE-ORDER 방식으로 순회하면서 LRU 정책에 의해 반환하기 때문에 우선순위가 높은 파드의 최근 사용되지 않은 페이지가 반환될 수 있다.

낮은 우선순위를 가진 파드가 메모리를 반환하기 위해 과도한 디스크 쓰기 작업을 수행하면 병목 현상이 발생할 수 있다. 이를 해결하기 위해 CGroupV2 에는 디스크 읽기/쓰기 한도를 설정할 수 있는 기능이 있지만, 아직 쿠버네티스는 이를 활용하고 있지 않다.
