// 경력서 데이터. 내용을 고칠 때는 이 파일만 수정하면 됩니다.
// posts: 블로그 글 slug (src/content/posts/<slug>) — 경력 항목의 근거로 링크됩니다.

export interface Item {
  text: string;
  sub?: string[];
  posts?: string[];
}

export interface Entry {
  org: string;
  role?: string;
  period: string;
  items: Item[];
}

export const profile = {
  name: 'Inhyeok Kim',
  handle: 'haruband',
  headline: 'Data·AI Platform Engineer · LLM Agent / RAG / Ontology / Rust Data Engine',
  summary: [
    '온톨로지 기반 Data/AI 플랫폼을 만들고 있으며, 이 플랫폼은 여러 대기업의 AX(AI 전환)에 활용되고 있습니다. LLM 에이전트 실행 환경과 도구, RAG·하이브리드 검색, 온톨로지 시맨틱 계층을 설계하고 개발합니다.',
    '리눅스 커널·가상화 연구로 시작해 쿠버네티스·eBPF 인프라, Rust 기반 데이터 엔진까지 시스템 전 계층을 직접 다뤄 왔고, 그 경험을 AI 플랫폼에 녹이고 있습니다.',
  ],
  links: [
    { label: 'Email', value: 'haruband@gmail.com', href: 'mailto:haruband@gmail.com' },
    { label: 'Blog', value: 'haruband.github.io', href: 'https://haruband.github.io' },
    { label: 'GitHub', value: 'github.com/haruband', href: 'https://github.com/haruband' },
    { label: 'LinkedIn', value: 'linkedin.com/in/inhyeok-kim', href: 'https://www.linkedin.com/in/inhyeok-kim-7620a0b0/' },
  ],
};

export const skills: { area: string; items: string[] }[] = [
  { area: 'AI', items: ['LLM Agent', 'Tool Calling', 'RAG', 'Hybrid Search (Vector + BM25)', 'Qdrant', 'Reranker', 'Ontology / Knowledge Graph', 'Python', 'Polars'] },
  { area: 'Data Engine', items: ['Rust', 'Apache Arrow', 'DataFusion', 'SedonaDB', 'Arrow Flight SQL', 'Raft', 'CDC', 'Delta Lake', 'Iceberg', 'Spark'] },
  { area: 'Cloud Native', items: ['Kubernetes', 'Cilium', 'eBPF', 'Istio', 'Ansible', 'Kustomize', 'OPA'] },
  { area: 'Data Platform', items: ['Kafka', 'Airflow', 'MinIO', 'MongoDB', 'Elasticsearch', 'Datadog'] },
  { area: 'Systems', items: ['Linux Kernel', 'Virtualization (KVM/Xen/Intel VT)', 'File Systems', 'Wayland/OpenGL ES'] },
];

export const experience: Entry[] = [
  {
    org: '디토닉',
    role: '기술 이사',
    period: '2025.06 – 현재',
    items: [
      {
        text: '온톨로지 기반 Data/AI 플랫폼 개발',
        sub: [
          '기업의 데이터를 업무 개념(온톨로지)으로 연결하고, 그 위에서 LLM 에이전트가 질문에 답하고 업무를 수행하는 플랫폼',
          '플랫폼의 AI 계층 전반을 설계하고 개발',
        ],
      },
      {
        text: 'LLM 에이전트 실행 환경 개발',
        sub: [
          '대화 기록과 장기 메모리를 유지하는 에이전트 실행 환경과, 에이전트를 배포·관리하는 제어 서버',
          '에이전트 동작의 특정 시점에 사용자 정의 로직을 끼워 넣는 확장 구조',
          '실제 대화 기록을 재생해 도구 설명과 응답 형식을 수치로 비교·개선하는 평가 체계',
        ],
      },
      {
        text: '에이전트 도구 개발',
        sub: [
          '사내 문서 검색, 온톨로지 탐색·집계, 데이터 계산 등 에이전트가 호출하는 기본 도구',
          '조회 결과가 잘리거나 비어 있을 때 이유를 함께 알려 주어, LLM이 틀린 답을 지어내지 않도록 설계',
        ],
      },
      {
        text: '문서 기반 질의응답(RAG) 검색 개발',
        sub: [
          '스캔 문서·PDF를 페이지 이미지 단위로 읽는 비전 모델 기반 문서 추출',
          '문서 분할, 임베딩, LLM을 이용한 검색 결과 재정렬',
          '의미 검색과 키워드 검색을 결합한 하이브리드 검색, 언어별 형태소 분석, 검색된 문단의 앞뒤 문맥 조회',
        ],
      },
      {
        text: '온톨로지 질의 엔진 개발',
        sub: [
          '여러 단계의 관계를 따라가며 집계·조건 검색을 수행하는 온톨로지 질의 엔진',
          '분석 코드를 읽어 데이터가 어디서 와서 어떻게 가공되는지(데이터 계보)를 자동으로 추적',
        ],
      },
      {
        text: 'AI 플랫폼의 데이터 계층 개발 (Rust)',
        sub: [
          '여러 노드에 걸쳐 동작하는 분산 분석 데이터베이스',
          '운영 데이터베이스의 변경 사항을 실시간으로 데이터 레이크에 적재하는 스트리밍 수집 엔진',
        ],
      },
    ],
  },
  {
    org: '잉클',
    role: 'CTO · DataOps / DevOps',
    period: '2022.03 – 2025.05',
    items: [
      {
        text: '실시간 AI 추론 플랫폼 개발',
        sub: ['스트리밍 시계열 데이터에 대한 실시간 추론', '오브젝트 스토리지에 저장된 이미지에 대한 추론'],
      },
      {
        text: '실시간 빅데이터 쿼리 엔진 개발 (Rust)',
        sub: [
          '직접 수행한 TPC-H 벤치마크에서 Spark 대비 약 10배 빠르고 메모리를 훨씬 적게 쓰는 Rust 엔진을 선정해, 이를 기반으로 쿼리 엔진 개발 및 최적화',
          '스트리밍 데이터를 저장하는 데이터 레이크 스토리지 계층 최적화',
          '다양한 클라이언트가 접속할 수 있도록 PostgreSQL 호환, 고속 바이너리, REST 프로토콜 지원',
          '정책 기반 데이터 접근 제어',
        ],
        posts: ['datafusion-overview', 'datafusion-aggregation', 'datafusion-join', 'datafusion-benchmark'],
      },
      { text: '레이크하우스(데이터 레이크 + 데이터 웨어하우스) 아키텍처 설계 및 개발' },
      {
        text: '쿠버네티스 클러스터 구축 및 운영',
        sub: ['온프레미스 클러스터 구축 자동화', '네트워크·메모리·스토리지 성능 최적화', '서비스 메시 도입 과정의 네트워크 호환성 문제 분석'],
        posts: ['k8s-istio-ambientmesh', 'k8s-istio-ambientmesh-flow', 'k8s-istio-ambientmesh-cilium'],
      },
    ],
  },
  {
    org: '바텍',
    role: 'SRE · DevOps / DataOps / MLOps',
    period: '2019.03 – 2022.02',
    items: [
      {
        text: '쿠버네티스 기반 데이터 플랫폼 구축',
        sub: [
          '엣지 환경의 제한된 자원에서 실시간 데이터 수집·저장·처리를 하나의 클러스터로 운영',
          '클러스터 설정을 코드로 관리하는 IaC 체계 구축',
        ],
      },
      {
        text: 'eBPF 기반 클러스터 네트워크 분석 및 최적화',
        sub: [
          '라우팅·로드밸런싱 방식별 지연 시간을 측정해 클러스터에 맞는 네트워크 구성 선정',
          '운영 중 발견한 컨테이너 네트워크 버그를 커널·eBPF 코드 수준에서 분석',
          '불필요한 네트워크 홉을 없애 메시지 큐(Kafka) 외부 접속 성능 개선',
        ],
        posts: ['k8s-cni-routing-benchmark', 'k8s-cni-ipvlan-redirect-bug', 'k8s-cni-loadbalancing', 'k8s-kafka-optimize-loadbalancer'],
      },
      {
        text: '메모리·스토리지 최적화',
        sub: [
          '스왑을 활용해 메모리가 부족한 노드에서도 Spark 스트리밍 작업이 성능 저하 없이 안정적으로 동작하도록 개선',
          'HDD·SSD·NVMe 특성에 맞춘 로컬 스토리지 구성',
        ],
        posts: ['k8s-memory-swap', 'k8s-spark-optimize', 'k8s-spark-optimize-swap'],
      },
      {
        text: '스트리밍 데이터 레이크 구축',
        sub: [
          '실시간 스트리밍 데이터를 저장하는 레이크하우스 설계 및 개발',
          '스트리밍 처리 지연의 원인(로그 정리, 체크포인트)을 분석해 처리 시간 안정화',
        ],
        posts: ['delta-overview', 'delta-checkpoints', 'delta-cleanup'],
      },
      { text: '로그·메트릭·APM 기반 클러스터 모니터링 체계 구축' },
    ],
  },
  {
    org: '네모유엑스',
    role: 'CEO · CTO (창업)',
    period: '2014.08 – 2017.08',
    items: [
      {
        text: '여러 사용자가 하나의 화면을 동시에 쓰는 UI 플랫폼 개발',
        sub: ['GPU 가속 화면 합성 엔진', '다중 사용자 입력을 지원하는 윈도우 매니저', '3D 공간에 창을 배치하는 윈도우 매니저'],
      },
    ],
  },
  {
    org: 'MDS 테크놀로지',
    period: '2006.03 – 2007.08',
    items: [
      {
        text: '모바일 방송(T-DMB/ISDB-T) 단말 소프트웨어 개발',
        sub: ['부트로더와 리눅스 커널을 신규 하드웨어에 이식하고 최적화', '방송 스트림 수신부터 재생까지 전체 소프트웨어 개발'],
      },
    ],
  },
];

export const education: Entry[] = [
  {
    org: '성균관대학교',
    role: '석사 · 박사',
    period: '2008.03 – 2019.02',
    items: [
      {
        text: '리눅스 커널 연구·개발',
        sub: ['스와핑·비휘발성 메모리를 활용한 메모리 관리', 'eBPF·인터럽트 최적화를 통한 고속 네트워킹', '파일시스템 및 블록 장치 드라이버'],
      },
      {
        text: '가상화 엔진 연구·개발',
        sub: [
          '리눅스 커널 기반 가상화 엔진, 하드웨어 가상화와 반가상화의 장점을 결합한 가상화 엔진',
          '하나의 스마트폰에서 두 개의 안드로이드를 실행하는 모바일 가상화 엔진 (2010 국무총리상)',
          '호스트와 게스트 운영체제 사이의 정보 단절을 없앤 가상화 전용 파일시스템',
          '보안 연구소 의뢰로 가상머신 안의 악성코드 동작을 외부에서 분석하는 도구 개발',
        ],
      },
      { text: '쿠버네티스 네트워킹·스토리지·메모리 관리 연구' },
    ],
  },
  {
    org: '성균관대학교',
    role: '학사',
    period: '1998.03 – 2006.02',
    items: [{ text: 'x86/ARM 운영체제 커널 개발, 리눅스 커널 분석 및 가상화 엔진 개발' }],
  },
];

export const awards = [
  {
    title: '대한민국 소프트웨어 공모대전 국무총리상 (금상)',
    year: '2010',
    desc: '안드로이드를 위한 모바일 가상화 엔진 — 리눅스 커널 기반 가상화 엔진을 자체 개발해 하나의 기기에서 두 개의 안드로이드를 동시에 실행',
  },
];
