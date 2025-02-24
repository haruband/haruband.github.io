+++
title = "[K8S] VXLAN 사용 불가 문제 분석"
date = 2021-03-12T00:00:00Z
updated = 2021-03-12T00:00:00Z
draft = false

[taxonomies]
tags = ["K8S", "Kubernetes", "Cilium"]
[extra]
toc = true
series = "K8S"
+++

오늘은 VMWare 기반의 IaaS 를 이용하여 쿠버네티스 클러스터를 구축하던 중 발생했던 문제를 파악하고 해결했던 과정을 간단히 소개해보고자 한다. 해당 문제와 유사한 문제가 다행히(?) AWS EC2 에서도 발생하여 EC2 를 기준으로 설명하도록 하겠다.

## 어떠한 문제가 발생했는가???

우리는 AWS 와 GCP 를 사용할때는 주로 매니지드 쿠버네티스 서비스를 활용하지만, 그렇지 않은 경우에는 kubespray 를 이용하여 쿠버네티스를 설치하고, kustomization 을 기반으로 개발한 IaC(InfrastructureAsCode)를 이용하여 서비스를 배포한다. 그리고 CNI 는 개인적으로 문제 분석과 해결이 용이한 Cilium 을 주로 사용하고 있다.

일단 상황은 이렇다. 회사 내부에서 딥러닝/빅데이터 클러스터에서 꾸준히 사용해오던 쿠버네티스를 동일한 방식으로 EC2 에 설치했는데 이상한 현상이 발생했다. **처음 접했던 현상은 서비스 디스커버리가 잘(?) 되지 않는 문제였다.** 그래서 kibana 와 mongos 같이 서비스 디스커버리를 이용하여 다른 파드에 접근하는 서비스들만 정상적인 동작을 하지 않았다. 이와 같은 현상의 원인을 파악하기 위해 일단은 서비스 디스커버리 쪽을 살펴보기로 했다.

원인 분석을 위해 클러스터 내부에 jupyterlab 을 설치하고 dig 를 이용하여 서비스 디스커버리가 잘 동작하는지 확인해보았다. nodelocaldns 를 사용 중이고, coredns 는 기본적으로 2개의 파드가 동작 중이다. 일단 nodelocaldns 쪽은 문제가 없다고 판단하여 바로 coredns 서비스로 dig 를 이용하여 질의를 해보았다. 동일한 도메인을 반복적으로 질의해보니 성공과 실패를 반복하는 이상한 현상이 발견되었다. 그래서 이번에는 두 개의 파드(coredns)로 각각 직접 질의를 해보았다. **놀랍게도 하나의 파드는 항상 성공했지만, 다른 하나의 파드는 항상 실패했다.**

두 개의 파드는 하나의 coredns 디플로이먼트로 배포된 완전히 동일한 파드인데 왜 이런 문제가 발생한 것일까? 사실은 두 개의 파드가 완전히 동일한 상황은 아니다. 왜냐하면 두 개의 파드가 서로 다른 노드에 존재하고, 둘 중 하나의 노드에만 jupyterlab 이 존재하기 때문이다. jupyterlab 에서 동일한 방식으로 각각의 파드에 질의를 보냈지만, 결과적으로는 하나의 파드는 같은 노드에 있어서 로컬 통신으로 요청이 잘 처리되었고, 다른 파드는 다른 노드에 있어서 외부 통신을 하던 중 문제가 발생했던 것이다. **즉, 해당 문제는 우리가 처음 접했던 서비스 디스커버리의 문제가 아니고, 네트워킹의 문제였다.**

## 어떻게 문제가 발생했는가???

우선 쿠버네티스에서 실제 통신을 처리하는 CNI 를 살펴보았다. 우리는 CNI 로 Cilium 을 사용 중이기 때문에 관련 정보들이 정확히 구성되어있는지 분석해보았다.

```
$ kubectl get services -n kube-system
NAME             TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                  AGE
coredns          ClusterIP   10.233.0.3      <none>        53/UDP,53/TCP,9153/TCP   3h14m
...
$ kubectl get pods -l k8s-app=kube-dns -o wide -n kube-system
NAME                       READY   STATUS    RESTARTS   AGE     IP              NODE    NOMINATED NODE   READINESS GATES
coredns-8474476ff8-d7pjv   1/1     Running   0          3h14m   10.233.64.125   node1   <none>           <none>
coredns-8474476ff8-nz2tt   1/1     Running   0          3h13m   10.233.65.250   node2   <none>           <none>
cilium(node1) $ cilium service list
ID   Frontend            Service Type   Backend
...
2    10.233.0.3:53       ClusterIP      1 => 10.233.64.125:53
                                        2 => 10.233.65.250:53
...
```

Cilium 의 2번 서비스를 보면 기본적인 coredns 서비스와 엔드포인트가 정확히 설정되어있는 것을 확인할 수 있다. 다음으로 노드 간 통신을 위해 VXLAN 을 사용 중이기 때문에 아래와 같이 터널링 정보도 확인해보았다.

```
cilium(node1) $ cilium bpf tunnel list
TUNNEL          VALUE
10.233.65.0:0   172.26.50.201:0
```

여기까지 살펴본 바로는 설정에는 아무런 문제가 없었다. 그럼 이제 실제 통신이 제대로 이루어지는지를 살펴보자. 확인을 위해 node1 에 존재하는 jupyterlab 에서 node2 에 있는 파(coredns)로 dig 를 이용하여 질의를 보낼때 node1 과 node2 에서 tcpdump 로 VXLAN 이 사용 중인 8472 UDP 포트를 모니터링하였다. 예상대로 node1 에서는 패킷을 전송하지만, node2 에서 해당 패킷을 수신하지 못했다. 몇 가지를 확인한 결과 AWS EC2 의 보안 그룹 설정에서 모든 UDP 를 막아두고 있었다. **그래서 해당 문제의 원인은 AWS EC2 보안 그룹에서 UDP 를 막아두어서 UDP 를 사용하는 VXLAN 터널링이 제대로 작동하지 않았던 것이다.**

참고로, VXLAN 기반의 터널링을 사용하는 경우, 앱에서 TCP 를 사용하더라도 다른 노드로 패킷을 전달할 때는 IP/UDP 로 한번 더 포장을 해서 전송하기 때문에 실제 노드 간 통신은 UDP 로 이루어진다.

## 어떻게 문제를 해결했는가???

해당 문제를 해결할 수 있는 방법은 두 가지 정도이다.

1. AWS EC2 보안 그룹 설정 변경
2. VXLAN 대신 다이렉트 라우팅 기법 사용

첫 번째 해결책이 간단하지만, 노드의 수가 많지 않고 모든 노드가 하나의 서브넷 안에 있다면 VXLAN 을 사용하지 않고 다이렉트 라우팅 기법을 사용하는 것이 더 나은 해결책일 것이다.
