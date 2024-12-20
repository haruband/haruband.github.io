+++
title = "[K8S] NAT 루프백 문제 분석 (LRP)"
date = 2021-04-02T00:00:00Z
updated = 2021-04-02T00:00:00Z
draft = false

[taxonomies]
tags = ["K8S", "Kubernetes"]
[extra]
toc = true
series = "K8S"
+++

오늘은 [지난 글](https://haruband.github.io/k8s-nat-loopback-snat)에서 소개했던 NAT 루프백 문제에 대해 다시 소개하고자 한다. 이유는 몇 개 국가의 IDC 혹은 클라우드에서 NAT 루프백 문제를 해결하기 위해 라우터에 필요한 설정을 추가했음에도 불구하고 원인을 정확히 알 수 없는 이유로 동작하지 않는 문제가 발생해서 다른 해결책을 찾을 필요가 있었기 때문이다.

외부 환경에 의존하지 않고 우리 스스로 해당 문제를 해결할 수 있는 방법은 클러스터 내부에서 외부 IP 를 사용하지 않는 것이다. 이를 위해 우리가 선택할 수 있는 옵션은 첫 번째는 내부 DNS 를 사용하는 것이고, 두 번째는 eBPF (혹은 IPTables) 를 사용하여 외부 IP 로 나가는 모든 패킷을 강제로 내부 IP 로 전달(redirection)하는 것이다. 그리고 해당 문제는 파드에서 외부 IP 를 접근하는 경우 뿐 아니라, 호스트 네트워크를 사용하는 파드나 Kubelet 에서 외부 IP 를 접근하는 경우도 고려할 필요가 있을 수 있다. (우리 같은 경우는 클러스터 내부에 컨테이너 레지스트리 서버를 운영 중이고, Kubelet 에서 컨테이너 이미지를 가져올 때 컨테이너 레지스트리 서버의 외부 도메인 주소를 이용하고 있었다.)

일반적으로 외부 IP 로 접근하면 NodePort 혹은 LoadBalancer 서비스 타입을 사용하는 인그레스게이트웨이(ingressgateway)를 통해 클러스터 내부 서비스로 요청이 전달된다. 이는 클러스터 내부에서 외부 IP 로 접근할 때도 동일한데, 위의 두 가지 방법으로 외부 IP 를 강제로 내부 IP 로 변경해버리면 인그레스게이트웨이를 통하지 않고 직접 클러스터 내부 서비스에 접근하는 것이기 때문에 호스트 네트워크를 사용하는 파드나 Kubelet 에서는 문제가 발생한다. 이는 [다른 글](https://haruband.github.io/k8s-cni-loadbalancing)에서 소개했던 소켓 기반 로드밸런싱 기능을 이용하면 해결할 수 있는데, 소켓 기반 로드밸런싱은 아래와 같이 각 노드의 루트 CGROUP 부터 모든 CGROUP 의 소켓 시스템콜에 연결된 BPF 프로그램을 통해 동작하기 때문에 이를 이용하면 호스트 네트워크에서도 클러스터 내부 서비스에 직접 접근이 가능해진다.

```bash
$ bpftool cgroup tree
CgroupPath
ID       AttachType      AttachFlags     Name
/sys/fs/cgroup/unified
845      connect4                        sock4_connect
825      connect6                        sock6_connect
853      post_bind4                      sock4_post_bind
833      post_bind6                      sock6_post_bind
857      sendmsg4                        sock4_sendmsg
837      sendmsg6                        sock6_sendmsg
861      recvmsg4                        sock4_recvmsg
841      recvmsg6                        sock6_recvmsg
849      getpeername4                    sock4_getpeerna
829      getpeername6                    sock6_getpeerna
```

우선 내부 DNS 를 사용하는 경우를 살펴보자. 가장 간단한 방법은 모든 노드의 /etc/hosts 를 이용하여 외부 도메인 주소를 강제로 내부 IP 로 변경해버리는 것이다. 하지만 이는 IP 만 변경해주는 것이기 때문에 외부에서 접근하는 포트와 내부에서 접근하는 포트가 다른 경우에는 사용할 수 없다.

다음은 Cilium 에서 제공하는 LRP(LocalRedirectPolicy) 라는 기능을 사용하는 경우이다. 이는 Cilium 에서 다양한 쿠버네티스 서비스를 BPF 를 이용하여 처리하는 것과 동일한 방식으로 외부 IP 에 대한 요청을 내부 IP 로 전달한다. 아래는 특정 IP(10.10.10.10)와 포트(8080)에 대한 요청을 클러스터 내부에 설치된 파드(nginx)로 전달하는 설정을 담고 있다.

```
apiVersion: "cilium.io/v2"
kind: CiliumLocalRedirectPolicy
metadata:
  name: nginx-lrp
spec:
  redirectFrontend:
    addressMatcher:
      ip: "10.10.10.10"
      toPorts:
        - port: "8080"
          protocol: TCP
  redirectBackend:
    localEndpointSelector:
      matchLabels:
        run: nginx
    toPorts:
      - port: "80"
        protocol: TCP
```

해당 CRD 를 설치한 다음 Cilium 의 서비스 목록을 확인해보면 아래와 같다.

```bash
$ kubectl get pods -o wide
NAME    READY   STATUS    RESTARTS   AGE     IP             NODE     NOMINATED NODE   READINESS GATES
nginx   1/1     Running   0          7m36s   192.168.0.80   master   <none>           <none>

node0 $ cilium service list
ID   Frontend              Service Type    Backend
1    10.96.0.1:443         ClusterIP       1 => 172.26.50.200:6443
2    10.96.0.10:53         ClusterIP       1 => 192.168.1.96:53
                                           2 => 192.168.1.219:53
3    10.96.0.10:9153       ClusterIP       1 => 192.168.1.96:9153
                                           2 => 192.168.1.219:9153
4    10.108.175.91:80      ClusterIP       1 => 192.168.0.80:80
5    172.26.50.235:80      LoadBalancer    1 => 192.168.0.80:80
6    172.26.50.200:30904   NodePort        1 => 192.168.0.80:80
7    0.0.0.0:30904         NodePort        1 => 192.168.0.80:80
8    10.10.10.10:8080      LocalRedirect   1 => 192.168.0.80:80
```

위의 서비스 목록을 보면 10.10.10.10:8080 으로 들어온 요청을 NGINX 엔드포인트인 192.168.0.80:80 으로 전달하는 항목(8번)이 보인다. 실제로 임의의 노드의 호스트에서 10.10.10.10:8080 으로 접속하면 아래와 같이 NGINX 의 인덱스 페이지를 가져오는 것을 볼 수 있다.

```bash
node0 $ curl http://10.10.10.10:8080
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
```

이처럼 NAT 루프백 문제가 발생하면 네트워크 관리자에게 SNAT 설정을 요청하는 것이 일반적이긴 하지만, 상황에 따라 다른 해결책이 필요한 경우도 있으니 참고하기 바란다.
