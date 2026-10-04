import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Label,
  Legend,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  DrillDownData,
  TornFactionBasicApi,
  FFScouterResult,
  GraphData,
  FactionColumns,
  MemberColumns,
} from "./types";
import { buildFactionData } from "./faction-data";
import { CategoricalChartState } from "recharts/types/chart/types";
import { DataTable } from "./data-table";
import { memberView } from "./member-view";
import { buildDirection } from "./direction";
import { Pin } from "./pinned-cell";
import { TargetHeatmap } from "./target-heatmap";
import { RankedChart } from "./ranked-chart";
import { useTimeToHits } from "./use-time-to-hits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronsUpDown } from "lucide-react";

enum ChartType {
  attack,
  defend,
}

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "#2563eb",
  },
  mobile: {
    label: "Mobile",
    color: "#60a5fa",
  },
} satisfies ChartConfig;

const EASY_COLOR = "#226600";
const POSSIBLE_COLOR = "#aab000";
const HARD_COLOR = "#ff9933";
const TARGETS_COLOR = "#0066FF";

interface ChartInterface {
  leftffscouterdata: FFScouterResult;
  rightffscouterdata: FFScouterResult;
  leftfactionbasic: TornFactionBasicApi;
  rightfactionbasic: TornFactionBasicApi;
}

function InnerFactionChartContainer({
  data,
  chartType,
  onClick,
}: {
  data: GraphData[];
  chartType: ChartType;
  onClick: (nextState: CategoricalChartState) => void;
}) {
  const series = [
    {
      key: "easy",
      name: "Easy",
      stackId: "counts",
      fill: EASY_COLOR,
      stroke: EASY_COLOR,
      dataKey: `easy_${chartType == ChartType.attack ? "attacks" : "defends"}_count`,
    },
    {
      key: "possible",
      name: "Possible",
      stackId: "counts",
      fill: POSSIBLE_COLOR,
      stroke: POSSIBLE_COLOR,
      dataKey: `possible_${chartType == ChartType.attack ? "attacks" : "defends"}_count`,
    },
    {
      key: "impossible",
      name: "Impossible",
      stackId: "counts",
      fill: HARD_COLOR,
      stroke: HARD_COLOR,
      dataKey: `hard_${chartType == ChartType.attack ? "attacks" : "defends"}_count`,
    },
  ];

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto lg:h-[500px] h-[250px] w-full"
    >
      <ComposedChart
        data={data}
        margin={{ bottom: 60 }}
        onClick={onClick}
        style={{ cursor: "pointer" }}
      >
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          interval="equidistantPreserveStart"
        />
        <YAxis>
          <Label value="count" angle={-90} />
        </YAxis>
        <Legend verticalAlign="top" />
        <CartesianGrid strokeDasharray="3 3" />
        {series.map((s) => (
          <Area
            key={s.key}
            name={s.name}
            stackId={s.stackId}
            fill={s.fill}
            stroke={s.stroke}
            dataKey={s.dataKey}
          />
        ))}
        <Line
          dataKey={`targets_${chartType == ChartType.attack ? "attacks" : "defends"}_count`}
          name={`${chartType == ChartType.attack ? "Targets" : "Attackers"}`}
          stroke={TARGETS_COLOR}
          dot={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

export function MyChart({
  leftffscouterdata,
  rightffscouterdata,
  leftfactionbasic,
  rightfactionbasic,
}: ChartInterface) {
  const [leftSelectedId, setLeftSelectedId] = useState<number | null>(null);
  const [rightSelectedId, setRightSelectedId] = useState<number | null>(null);
  // Each target heatmap has its own pinned cell.
  const [leftPin, setLeftPin] = useState<Pin>(null);
  const [rightPin, setRightPin] = useState<Pin>(null);
  const [easyFFMax, setEasyFFMax] = useState<number>(2.5);
  const [possibleFFMax, setPossibleFFMax] = useState<number>(4.0);
  const [minimumFFTarget, setMinimumFFTarget] = useState<number>(1.75);
  const [hitGoal, setHitGoal] = useState<number>(20);
  const [tab, setTab] = useState("faction_charts");

  function handleChartClick(select: (id: number) => void) {
    return function (nextState: CategoricalChartState) {
      if (!nextState.activePayload || !nextState.activePayload[0]) {
        return;
      }
      select(nextState.activePayload[0].payload.id);
    };
  }

  function handleFactionTableClick(select: (id: number) => void) {
    return function (value: GraphData) {
      select(value.id);
    };
  }

  const { left_data, right_data } = useMemo(
    () =>
      buildFactionData(
        leftffscouterdata,
        rightffscouterdata,
        leftfactionbasic,
        rightfactionbasic,
        { easyFFMax, possibleFFMax, minimumFFTarget },
      ),
    [
      leftffscouterdata,
      rightffscouterdata,
      leftfactionbasic,
      rightfactionbasic,
      easyFFMax,
      possibleFFMax,
      minimumFFTarget,
    ],
  );

  // The two directions of the war: each faction's attackers against the
  // other faction's defenders.
  const leftDirection = useMemo(
    () =>
      buildDirection({
        attackingFaction: leftfactionbasic,
        defendingFaction: rightfactionbasic,
        attackingEstimates: leftffscouterdata,
        defendingEstimates: rightffscouterdata,
        targetRange: { minimum: minimumFFTarget, maximum: possibleFFMax },
      }),
    [
      leftffscouterdata,
      rightffscouterdata,
      leftfactionbasic,
      rightfactionbasic,
      minimumFFTarget,
      possibleFFMax,
    ],
  );
  const rightDirection = useMemo(
    () =>
      buildDirection({
        attackingFaction: rightfactionbasic,
        defendingFaction: leftfactionbasic,
        attackingEstimates: rightffscouterdata,
        defendingEstimates: leftffscouterdata,
        targetRange: { minimum: minimumFFTarget, maximum: possibleFFMax },
      }),
    [
      leftffscouterdata,
      rightffscouterdata,
      leftfactionbasic,
      rightfactionbasic,
      minimumFFTarget,
      possibleFFMax,
    ],
  );

  // The time-to-hits estimate of each direction, null while it is computed.
  // Held here, above the tabs, so that leaving and re-entering the Faction
  // Charts tab does not recompute it.
  const onFactionCharts = tab === "faction_charts";
  const leftTimeToHits = useTimeToHits(leftDirection, hitGoal, onFactionCharts);
  const rightTimeToHits = useTimeToHits(
    rightDirection,
    hitGoal,
    onFactionCharts,
  );

  const { name: leftNameSelected, rows: leftSelected } = useMemo(
    () => memberView(left_data, leftSelectedId, { easyFFMax, possibleFFMax }),
    [left_data, leftSelectedId, easyFFMax, possibleFFMax],
  );
  const { name: rightNameSelected, rows: rightSelected } = useMemo(
    () => memberView(right_data, rightSelectedId, { easyFFMax, possibleFFMax }),
    [right_data, rightSelectedId, easyFFMax, possibleFFMax],
  );

  function InnerMemberChartContainer({
    data,
    name,
    chartType,
  }: {
    data: DrillDownData[];
    name: string;
    chartType: ChartType;
  }) {
    return (
      <ChartContainer
        config={chartConfig}
        className="aspect-auto lg:h-[500px] h-[250px] w-full"
      >
        <AreaChart data={data} margin={{ bottom: 60 }}>
          <XAxis
            xAxisId="name"
            label="name"
            dataKey="name"
            angle={-45}
            textAnchor="end"
            interval="equidistantPreserveStart"
          />
          <YAxis
            yAxisId={chartType == ChartType.attack ? "attacker" : "defender"}
            domain={[minimumFFTarget, possibleFFMax + 0.3]}
            allowDataOverflow
          />
          <Legend verticalAlign="top" />
          <CartesianGrid strokeDasharray="3 3" />
          <Area
            xAxisId="name"
            yAxisId={chartType == ChartType.attack ? "attacker" : "defender"}
            dataKey={
              chartType == ChartType.attack ? "attacker_ff" : "defender_ff"
            }
            name={"FF of " + name}
            fill="#666600"
            stroke="#666600"
          />
          <ChartTooltip content={<ChartTooltipContent />} />
        </AreaChart>
      </ChartContainer>
    );
  }

  const formSchema = z.object({
    easy_ff_max: z.coerce.number<number>(),
    possible_ff_max: z.coerce.number<number>(),
    minimum_ff_target: z.coerce.number<number>(),
    hit_goal: z.coerce.number<number>().int().min(1),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      easy_ff_max: 2.5,
      possible_ff_max: 4.0,
      minimum_ff_target: 1.75,
      hit_goal: 20,
    },
  });

  const [isFFLimitOpen, setIsFFLimitOpen] = useState(false);

  return (
    <>
      <div className={cn("flex flex-col gap-6")}>
        <Collapsible open={isFFLimitOpen} onOpenChange={setIsFFLimitOpen}>
          <Card className="mt-5 mx-5">
            <CardHeader>
              <div className="flex flex-col gap-1.5">
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  FF ranges for the charts and the hit goal for the time-to-hits
                  estimate
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild data-slot="card-action">
                <Button variant="ghost" size="icon" className="size-8">
                  <ChevronsUpDown />
                  <span className="sr-only">Toggle</span>
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(
                      (values: z.infer<typeof formSchema>) => {
                        console.log(values);
                        setEasyFFMax(values.easy_ff_max || 2.5);
                        setPossibleFFMax(values.possible_ff_max || 4.0);
                        setMinimumFFTarget(values.minimum_ff_target || 1.75);
                        setHitGoal(values.hit_goal || 20);
                      },
                    )}
                    className="space-y-8"
                  >
                    <div className="md:flex mb-5">
                      <FormField
                        control={form.control}
                        name="easy_ff_max"
                        render={({ field }) => (
                          <FormItem className="md:flex-1 md:mr-2.5">
                            <FormLabel>Easy FF Max</FormLabel>
                            <FormControl>
                              <Input placeholder="2.5" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="possible_ff_max"
                        render={({ field }) => (
                          <FormItem className="md:flex-1 mt-5 md:mt-0 md:mx-2.5">
                            <FormLabel>Possible FF Max</FormLabel>
                            <FormControl>
                              <Input placeholder="4.0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="minimum_ff_target"
                        render={({ field }) => (
                          <FormItem className="md:flex-1 mt-5 md:mt-0 md:mx-2.5">
                            <FormLabel>Minimum FF Target</FormLabel>
                            <FormControl>
                              <Input placeholder="1.75" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hit_goal"
                        render={({ field }) => (
                          <FormItem className="md:flex-1 mt-5 md:mt-0 md:ml-2.5">
                            <FormLabel>Hit Goal</FormLabel>
                            <FormControl>
                              <Input placeholder="20" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button type="submit">Submit</Button>
                  </form>
                </Form>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mt-5 mx-5">
          <TabsTrigger value="faction_charts">Faction Charts</TabsTrigger>
          <TabsTrigger value="faction_data">Data</TabsTrigger>
          <TabsTrigger value="member_charts">Member Charts</TabsTrigger>
          <TabsTrigger value="member_data">Data</TabsTrigger>
        </TabsList>
        <TabsContent
          value="faction_charts"
          className="grid grid-cols-2 gap-5 m-5"
        >
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as attacker ({leftfactionbasic.name})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerFactionChartContainer
                data={left_data}
                chartType={ChartType.attack}
                onClick={handleChartClick(setLeftSelectedId)}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as attacker ({rightfactionbasic.name})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerFactionChartContainer
                data={right_data}
                chartType={ChartType.attack}
                onClick={handleChartClick(setRightSelectedId)}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as defender ({leftfactionbasic.name})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerFactionChartContainer
                data={left_data}
                chartType={ChartType.defend}
                onClick={handleChartClick(setLeftSelectedId)}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as defender ({rightfactionbasic.name})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerFactionChartContainer
                data={right_data}
                chartType={ChartType.defend}
                onClick={handleChartClick(setRightSelectedId)}
              />
            </CardContent>
          </Card>
          {/* One column per direction: its heatmap with its ranked chart
              directly below, also when the columns are stacked. */}
          <div className="col-span-2 flex flex-col gap-5 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>
                  Target heatmap ({leftfactionbasic.name} attacking)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TargetHeatmap
                  direction={leftDirection}
                  pin={leftPin}
                  onPinChange={setLeftPin}
                  onSelectAttacker={setLeftSelectedId}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  Time to {hitGoal} hits for {leftfactionbasic.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedChart
                  direction={leftDirection}
                  estimate={leftTimeToHits}
                />
              </CardContent>
            </Card>
          </div>
          <div className="col-span-2 flex flex-col gap-5 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>
                  Target heatmap ({rightfactionbasic.name} attacking)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TargetHeatmap
                  direction={rightDirection}
                  pin={rightPin}
                  onPinChange={setRightPin}
                  onSelectAttacker={setRightSelectedId}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  Time to {hitGoal} hits for {rightfactionbasic.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankedChart
                  direction={rightDirection}
                  estimate={rightTimeToHits}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent
          value="faction_data"
          className="grid grid-cols-2 gap-5 m-5"
        >
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>{leftfactionbasic.name} data</CardTitle>
            </CardHeader>
            <CardContent>
              Total: {left_data.length}
              <DataTable
                columns={FactionColumns}
                data={left_data}
                onClick={handleFactionTableClick(setLeftSelectedId)}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>{rightfactionbasic.name} data</CardTitle>
            </CardHeader>
            <CardContent>
              Total: {right_data.length}
              <DataTable
                columns={FactionColumns}
                data={right_data}
                onClick={handleFactionTableClick(setRightSelectedId)}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent
          value="member_charts"
          className="grid grid-cols-2 gap-5 m-5"
        >
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as attacker ({leftNameSelected})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerMemberChartContainer
                data={leftSelected}
                chartType={ChartType.attack}
                name={leftNameSelected}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as defender ({leftNameSelected})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerMemberChartContainer
                data={leftSelected}
                chartType={ChartType.defend}
                name={leftNameSelected}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as attacker ({rightNameSelected})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerMemberChartContainer
                data={rightSelected}
                chartType={ChartType.attack}
                name={rightNameSelected}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>FF as defender ({rightNameSelected})</CardTitle>
            </CardHeader>
            <CardContent>
              <InnerMemberChartContainer
                data={rightSelected}
                chartType={ChartType.defend}
                name={rightNameSelected}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="member_data" className="grid grid-cols-2 gap-5 m-5">
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>{leftNameSelected} details</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={MemberColumns}
                data={leftSelected}
                onClick={() => {}}
              />
            </CardContent>
          </Card>
          <Card className="col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>{rightNameSelected} details</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={MemberColumns}
                data={rightSelected}
                onClick={() => {}}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
