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
import { useState, Dispatch, SetStateAction, useMemo } from "react";
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
  FairFightScore,
  FFScouterResult,
  GraphData,
  TornMemberApi,
  FFScouterJson,
  FactionColumns,
  MemberColumns,
} from "./types";
import { CategoricalChartState } from "recharts/types/chart/types";
import { DataTable } from "./data-table";
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
import { HeatmapLookPrototype } from "./heatmap-look-prototype";

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
  const [leftSelected, setLeftSelected] = useState<DrillDownData[]>([]);
  const [leftNameSelected, setLeftNameSelected] = useState("");
  const [rightSelected, setRightSelected] = useState<DrillDownData[]>([]);
  const [rightNameSelected, setRightNameSelected] = useState("");
  const [easyFFMax, setEasyFFMax] = useState<number>(2.5);
  const [possibleFFMax, setPossibleFFMax] = useState<number>(4.0);
  const [minimumFFTarget, setMinimumFFTarget] = useState<number>(1.75);

  function handleChartClick(
    setter: Dispatch<SetStateAction<DrillDownData[]>>,
    nameSetter: Dispatch<SetStateAction<string>>,
  ) {
    return function (nextState: CategoricalChartState) {
      if (!nextState.activePayload || !nextState.activePayload[0]) {
        return;
      }
      setter(massage_graph_data(nextState.activePayload[0].payload));
      nameSetter(nextState.activePayload[0].payload.name);
    };
  }

  function handleFactionTableClick(
    setter: Dispatch<SetStateAction<DrillDownData[]>>,
    nameSetter: Dispatch<SetStateAction<string>>,
  ) {
    return function (value: GraphData) {
      setter(massage_graph_data(value));
      nameSetter(value.name);
    };
  }

  function massage_graph_data(d: GraphData): DrillDownData[] {
    return d.opponent_scores.map((value) => {
      return {
        name: value.name,
        id: value.id,
        attacker_ff: value.attacker_ff,
        defender_ff: value.defender_ff,
        attacker_ff_str: value.attacker_ff_str,
        defender_ff_str: value.defender_ff_str,
        bss_public: value.bss_public,
        bs_estimate_human: value.bs_estimate_human,
        easy_attack:
          value.attacker_ff != null && value.attacker_ff <= easyFFMax ? 1 : 0,
        possible_attack:
          value.attacker_ff != null &&
          value.attacker_ff <= possibleFFMax &&
          value.attacker_ff > easyFFMax
            ? 1
            : 0,
        hard_attack:
          value.attacker_ff != null && value.attacker_ff > possibleFFMax
            ? 1
            : 0,
        easy_defend:
          value.defender_ff != null && value.defender_ff <= easyFFMax ? 1 : 0,
        possible_defend:
          value.defender_ff != null &&
          value.defender_ff <= possibleFFMax &&
          value.defender_ff > easyFFMax
            ? 1
            : 0,
        hard_defend:
          value.defender_ff != null && value.defender_ff > possibleFFMax
            ? 1
            : 0,
      };
    });
  }

  function massage_data(
    leftffscouterdata: FFScouterResult,
    rightffscouterdata: FFScouterResult,
    leftfactiondata: TornFactionBasicApi,
    rightfactiondata: TornFactionBasicApi,
    easyFFMax: number,
    possibleFFMax: number,
  ): { left_data: GraphData[]; right_data: GraphData[] } {
    const sort_function = (a: FFScouterJson, b: FFScouterJson) => {
      if (a.bss_public == null && b.bss_public == null) {
        return 0;
      }
      if (a.bss_public == null) {
        return -1;
      }
      if (b.bss_public == null) {
        return 1;
      }
      return a.bss_public - b.bss_public;
    };
    // factions sorted by lower BSS to highest
    const sorted_left: FFScouterJson[] =
      leftffscouterdata.toSorted(sort_function);
    const sorted_right: FFScouterJson[] =
      rightffscouterdata.toSorted(sort_function);

    const map_data = (
      primaryfaction: TornFactionBasicApi,
      opponentfaction: TornFactionBasicApi,
      opponent: FFScouterResult,
    ) => {
      let member_number = 0;
      return (value: FFScouterJson): GraphData => {
        member_number++;
        const member: TornMemberApi =
          primaryfaction.members["" + value.player_id];
        const opponent_scores = opponent.map(
          (enemy) =>
            new FairFightScore(
              opponentfaction.members["" + enemy.player_id].name,
              "" + enemy.player_id,
              value.bss_public,
              enemy.bss_public,
              enemy.bs_estimate_human,
            ),
        );
        const lists = {
          easy_attacks: opponent_scores.filter(
            (value) =>
              value.attacker_ff != null && value.attacker_ff <= easyFFMax,
          ),
          possible_attacks: opponent_scores.filter(
            (value) =>
              value.attacker_ff != null &&
              value.attacker_ff <= possibleFFMax &&
              value.attacker_ff > easyFFMax,
          ),
          hard_attacks: opponent_scores.filter(
            (value) =>
              value.attacker_ff != null && value.attacker_ff > possibleFFMax,
          ),
          easy_defends: opponent_scores.filter(
            (value) =>
              value.defender_ff != null && value.defender_ff >= possibleFFMax,
          ),
          possible_defends: opponent_scores.filter(
            (value) =>
              value.defender_ff != null &&
              value.defender_ff < possibleFFMax &&
              value.defender_ff >= easyFFMax,
          ),
          hard_defends: opponent_scores.filter(
            (value) =>
              value.defender_ff != null && value.defender_ff < easyFFMax,
          ),
          targets_attacks: opponent_scores.filter(
            (value) =>
              value.attacker_ff != null &&
              value.attacker_ff >= minimumFFTarget &&
              value.attacker_ff < possibleFFMax,
          ),
          targets_defends: opponent_scores.filter(
            (value) =>
              value.defender_ff != null &&
              value.defender_ff >= minimumFFTarget &&
              value.defender_ff < possibleFFMax,
          ),
        };
        return {
          name: member?.name ?? "Unknown",
          number: member_number,
          id: value.player_id,
          bs_estimate_human: value.bs_estimate_human,
          opponent_scores: opponent_scores,
          bss_public: value.bss_public,
          easy_attacks: lists.easy_attacks,
          easy_attacks_count: lists.easy_attacks.length,
          possible_attacks: lists.possible_attacks,
          possible_attacks_count: lists.possible_attacks.length,
          hard_attacks: lists.hard_attacks,
          hard_attacks_count: lists.hard_attacks.length,
          easy_defends: lists.easy_defends,
          easy_defends_count: lists.easy_defends.length,
          possible_defends: lists.possible_defends,
          possible_defends_count: lists.possible_defends.length,
          hard_defends: lists.hard_defends,
          hard_defends_count: lists.hard_defends.length,
          targets_attacks: lists.targets_attacks,
          targets_attacks_count: lists.targets_attacks.length,
          targets_defends: lists.targets_defends,
          targets_defends_count: lists.targets_defends.length,
        };
      };
    };

    const no_unavailable = (faction: TornFactionBasicApi) => {
      return (item: FFScouterJson) => {
        const member = faction.members["" + item.player_id];
        return (
          member.status.state != "Fallen" && member.status.state != "Federal"
        );
      };
    };

    const left_data: GraphData[] = sorted_left
      .filter(no_unavailable(leftfactiondata))
      .map(map_data(leftfactiondata, rightfactiondata, sorted_right));
    const right_data: GraphData[] = sorted_right
      .filter(no_unavailable(rightfactiondata))
      .map(map_data(rightfactiondata, leftfactiondata, sorted_left));

    console.log(left_data);
    console.log(right_data);

    return { left_data: left_data, right_data: right_data };
  }

  const { left_data, right_data } = useMemo(
    () =>
      massage_data(
        leftffscouterdata,
        rightffscouterdata,
        leftfactionbasic,
        rightfactionbasic,
        easyFFMax,
        possibleFFMax,
      ),
    [
      leftffscouterdata,
      rightffscouterdata,
      leftfactionbasic,
      rightfactionbasic,
      easyFFMax,
      possibleFFMax,
    ],
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
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      easy_ff_max: 2.5,
      possible_ff_max: 4.0,
      minimum_ff_target: 1.75,
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
                <CardTitle>Change FF limits</CardTitle>
                <CardDescription>Set FF ranges for graphs</CardDescription>
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
                          <FormItem className="md:flex-1 mt-5 md:mt-0 md:ml-2.5">
                            <FormLabel>Minimum FF Target</FormLabel>
                            <FormControl>
                              <Input placeholder="1.75" {...field} />
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
      <Tabs defaultValue="faction_charts">
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
                onClick={handleChartClick(setLeftSelected, setLeftNameSelected)}
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
                onClick={handleChartClick(
                  setRightSelected,
                  setRightNameSelected,
                )}
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
                onClick={handleChartClick(setLeftSelected, setLeftNameSelected)}
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
                onClick={handleChartClick(
                  setRightSelected,
                  setRightNameSelected,
                )}
              />
            </CardContent>
          </Card>
          {/* PROTOTYPE: heatmap difficulty colours and share count display,
              ?colour=A|B|C|D|E and ?share=1|2|3|4 */}
          <HeatmapLookPrototype
            left={left_data}
            right={right_data}
            leftName={leftfactionbasic.name}
            rightName={rightfactionbasic.name}
            minFF={minimumFFTarget}
            easyFF={easyFFMax}
            maxFF={possibleFFMax}
            onSelectLeft={handleFactionTableClick(
              setLeftSelected,
              setLeftNameSelected,
            )}
            onSelectRight={handleFactionTableClick(
              setRightSelected,
              setRightNameSelected,
            )}
          />
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
                onClick={handleFactionTableClick(
                  setLeftSelected,
                  setLeftNameSelected,
                )}
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
                onClick={handleFactionTableClick(
                  setRightSelected,
                  setRightNameSelected,
                )}
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
