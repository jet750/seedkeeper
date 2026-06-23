# -*- coding: utf-8 -*-
"""Seedkeeper World v1 generator -> Tiled 1.12.2 TMX (+preview).
Alpha-derived atomic prop footprints; two-tier density; living-world nature_dynamic layer.
Builds world_v1_a (150 seedA), world_v1_b (150 seedB), world_v1_massive (400)."""
import json, math, random

OUT="/sessions/wizardly-awesome-pasteur/mnt/dev/seedkeeper/assets/tilemaps/"

# ---- v1 tilesets (name, firstgid, tilecount, cols, w,h, source rel to tilemaps) ----
TS=[
 ("garden tiles",1,77,11,176,112,"../images/ground/Grass_tiles_v2.png"),
 ("forest tiles",78,77,11,176,112,"../images/ground/Darker_Grass_Tiles_v2.png"),
 ("garden soil",155,77,11,176,112,"../images/ground/Soil_Ground_Tiles.png"),
 ("forest soil",232,77,11,176,112,"../images/ground/Darker_Soil_Ground_Tiles.png"),
 ("stone tiles",309,77,11,176,112,"../images/ground/Stone_Ground_Tiles.png"),
 ("sprout land water",386,4,4,64,16,"../images/ground/Water.png"),
 ("stone path",390,16,4,64,64,"../images/paths/Stone_Path.png"),
 ("wooden path",406,16,4,64,64,"../images/paths/Paths.png"),
 ("bridges",422,12,4,64,48,"../images/paths/Wooden_Bridge_v2.png"),
 ("trees shrubs",434,84,12,192,112,"../images/nature/trees_stumps_bushes.png"),
 ("mushroom flower stone",518,60,12,192,80,"../images/nature/mushrooms_flowers_stones.png"),
 ("water props",578,24,12,192,32,"../images/nature/Water Objects.png"),
 ("fences",602,32,8,128,64,"../images/structures/Fences.png"),
 ("fence gate",634,30,10,160,48,"../images/structures/fence_gate.png"),
 ("water well",664,4,2,32,32,"../images/structures/water_well.png"),
 ("work station",668,4,2,32,32,"../images/structures/work_station.png"),
 ("signs",672,24,6,96,64,"../images/structures/signs.png"),
]
TSX_SRC={n:n+".tsx" for (n,_,_,_,_,_,_) in TS}

# ---- ground fill GIDs (local 55 = clean fill on 11-wide blob sheets) ----
MEADOW=1+55; FOREST=78+55; BEDSOIL=155+55; FSOIL=232+55; STONE=309+55; WATER=386
SPATH=390+5; WPATH=406+5                          # path centers (3x3 autotile center)
BR_H=422+4; BR_V=422+1                            # bridge deck horizontal / vertical
# fences
FC=602+0; FHL=602+1; FHM=602+2; FHR=602+3; FVL=602+8; FVR=602+8
GATE=634+0
WELL=[(0,0,664),(1,0,665),(0,1,666),(1,1,667)]    # 2x2
WORK=[(0,0,668),(1,0,669),(0,1,670),(1,1,671)]    # 2x2

# ---- alpha-derived prop stamps (dx,dy,localGID); world gid = firstgid + local ----
def S(fg,locs): return [(dx,dy,fg+l) for (dx,dy,l) in locs]
TREES_FG=434
# colliding trees (footprint cells)
TREE_SMALL=S(TREES_FG,[(0,0,0),(0,1,12)])                              # 1x2
TREE_PLAIN=S(TREES_FG,[(0,0,1),(1,0,2),(0,1,13),(1,1,14)])             # 2x2 (base for fruit)
TREE_HERO =S(TREES_FG,[(0,0,45),(1,0,46),(2,0,47),(0,1,57),(1,1,58),(2,1,59),(0,2,69),(1,2,70),(2,2,71)]) # 3x3
FRUIT_OVERLAY={
 "apple": S(TREES_FG,[(0,0,3),(1,0,4),(0,1,15),(1,1,16)]),
 "orange":S(TREES_FG,[(0,0,5),(1,0,6),(0,1,17),(1,1,18)]),
 "yellow":S(TREES_FG,[(0,0,7),(1,0,8),(0,1,19),(1,1,20)]),
 "pink":  S(TREES_FG,[(0,0,9),(1,0,10),(0,1,21),(1,1,22)]),
}
# non-colliding understory from trees sheet
BUSH=S(TREES_FG,[(0,0,36)])                                            # 1x1 plain bush
STUMP=S(TREES_FG,[(0,0,72)])                                           # 1x1
LOGS=[S(TREES_FG,[(0,0,74),(1,0,75)]),S(TREES_FG,[(0,0,79),(1,0,80)]),S(TREES_FG,[(0,0,81),(1,0,82)])]
MFS_FG=518
PEBBLES=[S(MFS_FG,[(0,0,12)]),S(MFS_FG,[(0,0,13)]),S(MFS_FG,[(0,0,14)]),S(MFS_FG,[(0,0,15)])]
BOULDER=S(MFS_FG,[(0,0,18),(1,0,19),(0,1,30),(1,1,31)])                # 2x2 sparse
TUFTS=[S(MFS_FG,[(0,0,24)]),S(MFS_FG,[(0,0,25)]),S(MFS_FG,[(0,0,26)]),S(MFS_FG,[(0,0,27)])]
SUNFLOWER=S(MFS_FG,[(0,0,39),(0,1,51)])                                # 1x2 landmark
# dynamic species: ordered growth frames (world gids), all 1x1, base=frame0
DYN={
 "mushroom_red":[MFS_FG+0,MFS_FG+1,MFS_FG+2],
 "mushroom_purple":[MFS_FG+3,MFS_FG+4,MFS_FG+5],
 "flower_yellow":[MFS_FG+36,MFS_FG+37,MFS_FG+38],
 "flower_pink":[MFS_FG+40,MFS_FG+41,MFS_FG+42],
 "flower_blue":[MFS_FG+52,MFS_FG+53,MFS_FG+54],
}
WP_FG=578
WATER_ROCKS=[S(WP_FG,[(0,0,0)]),S(WP_FG,[(0,0,1)]),S(WP_FG,[(0,0,2)]),S(WP_FG,[(0,0,3)])]
REEDS=[S(WP_FG,[(0,0,6)]),S(WP_FG,[(0,0,7)])]
LILIES=[S(WP_FG,[(0,0,8)]),S(WP_FG,[(0,0,9)]),S(WP_FG,[(0,0,10)])]    # 9 = flowering

LAYERS=["ground","water","paths_main","paths_spur","bridges","fences","structures","props_trees","props_ground","props_water"]
print("v1 config loaded; tilesets:",len(TS))

# ============================ geometry helpers ============================
def make_layers(N): return {n:[0]*(N*N) for n in LAYERS}
def disk(cx,cy,rad):
    out=set(); ri=int(math.ceil(rad))
    for r in range(int(cy-ri),int(cy+ri)+1):
        for c in range(int(cx-ri),int(cx+ri)+1):
            if math.hypot(c-cx,r-cy)<=rad: out.add((c,r))
    return out
def line_cells(pts,width):
    rad=width/2.0; out=set()
    for i in range(len(pts)-1):
        ax,ay=pts[i]; bx,by=pts[i+1]; steps=max(1,int(math.hypot(bx-ax,by-ay)))
        for t in range(steps+1):
            out|=disk(ax+(bx-ax)*t/steps, ay+(by-ay)*t/steps, rad)
    return out
def ellipse(cx,cy,rx,ry):
    out=set()
    for r in range(int(cy-ry),int(cy+ry)+1):
        for c in range(int(cx-rx),int(cx+rx)+1):
            if ((c-cx)/rx)**2+((r-cy)/ry)**2<=1: out.add((c,r))
    return out
def rect(l,t,w,h): return {(c,r) for r in range(t,t+h) for c in range(l,l+w)}

# ============================ per-size layouts ============================
def layout(N,variant):
    cx=cy=N//2
    if N<=150:
        art=[ [(cx,cy-26),(cx,cy-45),(cx-3,cy-63),(cx,cy-75)],            # N
              [(cx+25,cy),(cx+45,cy),(cx+60,cy-3),(N-1,cy)],               # E
              [(cx-25,cy),(cx-45,cy),(cx-61,cy+3),(0,cy)] ]                # W
        spur=[ [(cx-45,cy),(cx-47,cy+25),(cx-51,cy+45)],                   # ->lake
               [(cx+45,cy),(cx+53,cy-25),(cx+57,cy-45)],                   # ->NE encounter
               [(cx-51,cy+45),(cx-58,cy+63)],                             # ->SW deadend
               [(cx+60,cy-3),(cx+65,cy+35),(cx+63,cy+60)] ]               # ->SE deadend
        rivers=[ ([(cx-35,0),(cx-41,30),(cx-33,60),(cx-45,95),(cx-37,125),(cx-45,N-1)],3),
                 ([(cx-33,60),(cx-55,70),(cx-67,80)],2) ]
        lakes=[(cx-51,124,10,7)]
        meadow_pockets=[(cx-55,40,7),(cx+55,110,7),(cx+40,30,6)]
        payloads=[(cx-51,45,"lake"),(cx+57,45,"encounter"),(cx-58,63,"deadend"),(cx+63,60,"deadend")]
    else:
        art=[ [(cx,cy-26),(cx,cy-80),(cx-4,cy-140),(cx,0)],
              [(cx+25,cy),(cx+80,cy),(cx+140,cy-4),(N-1,cy)],
              [(cx-25,cy),(cx-80,cy),(cx-140,cy+4),(0,cy)] ]
        spur=[ [(cx-80,cy),(cx-90,cy+100),(cx-110,cy+150)],                # ->lake L1
               [(cx+80,cy),(cx+120,cy-80),(cx+140,cy-90)],                 # ->lake L2
               [(cx,cy-80),(cx-60,cy-110),(cx-110,cy-150)],                # ->NW deep deadend
               [(cx+140,cy-4),(cx+150,cy+80),(cx+150,cy+150)],             # ->SE deadend
               [(cx-110,cy+150),(cx-150,cy+150)],                          # ->SW deep deadend
               [(cx+80,cy),(cx+110,cy+90),(cx+120,cy+150)] ]               # ->S encounter
        rivers=[ ([(cx-160,0),(cx-130,80),(cx-80,140),(cx-50,200),(cx-70,280),(cx-110,360),(cx-140,N-1)],4),
                 ([(cx-50,200),(cx-90,220),(cx-120,240)],3),
                 ([(N-1,40),(cx+130,90),(cx+100,170),(cx+100,240),(cx+130,320),(cx+160,N-1)],4),
                 ([(cx+100,240),(cx+140,260),(cx+180,280)],3) ]
        lakes=[(cx-110,150,18,12),(cx+140,-90+cy,16,11)]
        meadow_pockets=[(cx-120,70,11),(cx+120,80,11),(cx-90,300,10),(cx+150,300,10),
                        (cx,cy-120,9),(cx-150,200,9),(cx+170,180,9),(cx,cy+150,10)]
        payloads=[(cx-110,150,"lake"),(cx+140,cy-90,"lake"),(cx-110,cy-150,"deadend"),
                  (cx+150,cy+150,"deadend"),(cx-150,cy+150,"deadend"),(cx+120,cy+150,"encounter")]
    if variant=="b":
        mir=lambda p:[(N-1-x,y) for (x,y) in p]
        rivers=[(mir(p),w) for (p,w) in rivers]
        lakes=[(N-1-x,y,rx,ry) for (x,y,rx,ry) in lakes]
        meadow_pockets=[(N-1-x,y,r) for (x,y,r) in meadow_pockets]+[(cx-30,cy-50,7),(cx+35,cy+55,7)]
        payloads=[(N-1-x,y,k) for (x,y,k) in payloads]
        spur=[[(N-1-x,y) for (x,y) in s] for s in spur]
    return dict(cx=cx,cy=cy,art=art,spur=spur,rivers=rivers,lakes=lakes,
                meadow_pockets=meadow_pockets,payloads=payloads)

def biome(c,r,N,pockets,jit):
    cx=cy=N/2.0
    for (px,py,rad) in pockets:
        if math.hypot(c-px,r-py)<=rad: return "meadow"
    dx=(c-cx)/(N/2.0); dy=(r-cy)/(N/2.0); d=math.hypot(dx,dy); th=math.atan2(dy,dx)
    d+=0.06*math.sin(3*th+jit)+0.035*math.sin(5*th+jit*1.7)
    if d<0.34: return "meadow"
    if d<0.58: return "light_forest"
    if d<0.82: return "mid_forest"
    return "deep_forest"

# ============================ homestead ============================
HS=50
def build_homestead(L,markers,cx,cy):
    left=cx-HS//2; top=cy-HS//2; right=left+HS-1; bot=top+HS-1
    inter=rect(left,top,HS,HS)
    gh=3  # gate half-gap (6-tile opening)
    for c in range(left,right+1):
        if abs(c-cx)>gh: put(L,"fences",c,top,FHM)      # top w/ N gate gap
        put(L,"fences",c,bot,FHM)                        # bottom solid (S closed)
    for r in range(top,bot+1):
        if abs(r-cy)>gh: put(L,"fences",left,r,FVL)      # left w/ W gate
        if abs(r-cy)>gh: put(L,"fences",right,r,FVR)     # right w/ E gate
    for (c,r) in [(left,top),(right,top),(left,bot),(right,bot)]: put(L,"fences",c,r,FC)
    for (c,r,nm) in [(cx,top,"gate_north"),(right,cy,"gate_east"),(left,cy,"gate_west")]:
        put(L,"fences",c,r,GATE); markers.append(("gate",nm,c,r))
    # beds 2x4, each 2x2 tilled soil
    bx=[cx-18,cx-8,cx+2,cx+12]; by=[cy-12,cy-4]
    bi=0
    for ry in by:
        for x in bx:
            for dc in (0,1):
                for dr in (0,1): put(L,"structures",x+dc,ry+dr,BEDSOIL)
            markers.append(("bed","garden_bed_%d"%bi,x,ry)); bi+=1
    for (dx,dy,g) in WELL: put(L,"structures",cx-20+dx,cy+6+dy,g)
    for (dx,dy,g) in WORK: put(L,"structures",cx+16+dx,cy+6+dy,g)
    markers.append(("well","well",cx-20,cy+6)); markers.append(("work_station","work_station",cx+16,cy+6))
    markers.append(("player_start","player_start",cx,cy))
    return inter

def put(L,name,c,r,gid):
    if 0<=c<_N[0] and 0<=r<_N[0]: L[name][r*_N[0]+c]=gid
_N=[150]
print("part2 ok")

# ============================ build pipeline ============================
def cluster(cells):
    groups=[]
    for cell in sorted(cells):
        hit=None
        for grp in groups:
            gx=sum(p[0] for p in grp)/len(grp); gy=sum(p[1] for p in grp)/len(grp)
            if abs(cell[0]-gx)<=6 and abs(cell[1]-gy)<=6: hit=grp; break
        if hit: hit.append(cell)
        else: groups.append([cell])
    return [(int(round(sum(p[0] for p in g)/len(g))),int(round(sum(p[1] for p in g)/len(g)))) for g in groups]

def build(N,variant,seed):
    _N[0]=N; random.seed(seed)
    L=make_layers(N); dyn=[]; markers=[]
    lay=layout(N,variant); cx,cy=lay["cx"],lay["cy"]; jit=0.0 if variant=="a" else 1.3
    water=set()
    for (pts,w) in lay["rivers"]: water|=line_cells(pts,w)
    for (x,y,rx,ry) in lay["lakes"]: water|=ellipse(x,y,rx,ry)
    stone=set()
    for p in lay["art"]: stone|=line_cells(p,3)
    wood=set()
    for p in lay["spur"]: wood|=line_cells(p,2)
    wood-=stone; paths=stone|wood
    hs=rect(cx-HS//2,cy-HS//2,HS,HS); hs_excl=rect(cx-HS//2-1,cy-HS//2-1,HS+2,HS+4)
    # ground
    for r in range(N):
        for c in range(N):
            z="meadow" if (c,r) in hs else biome(c,r,N,lay["meadow_pockets"],jit)
            g=MEADOW
            if z in("light_forest","mid_forest"): g=FOREST
            elif z=="deep_forest": g=FOREST
            L["ground"][r*N+c]=g
    for (c,r) in water:
        if 0<=c<N and 0<=r<N: L["water"][r*N+c]=WATER
    for (c,r) in stone:
        if (c,r) not in water: put(L,"paths_main",c,r,SPATH)
    for (c,r) in wood:
        if (c,r) not in water and L["paths_main"][r*N+c]==0: put(L,"paths_spur",c,r,WPATH)
    cross=paths & water
    def horiz(c,r):
        lr=((c-1,r) in paths)+((c+1,r) in paths); ud=((c,r-1) in paths)+((c,r+1) in paths)
        return lr>=ud
    for (c,r) in cross: put(L,"bridges",c,r, BR_H if horiz(c,r) else BR_V)
    bridges=cluster(cross)
    build_homestead(L,markers,cx,cy)
    block=water|paths|hs_excl|cross
    occupied=set(); trunks=[]
    def fits(stamp,c,r):
        cells=[(c+dx,r+dy) for (dx,dy,_) in stamp]
        for (cc,rr) in cells:
            if not(0<=cc<N and 0<=rr<N): return None
            if (cc,rr) in block or (cc,rr) in occupied: return None
        return cells
    def stamp_to(layer,stamp,c,r,cells):
        for (dx,dy,g) in stamp: put(L,layer,c+dx,r+dy,g)
        for cc in cells: occupied.add(cc)
    TREE_PR={"meadow":0.012,"light_forest":0.05,"mid_forest":0.09,"deep_forest":0.13}
    GAP={"meadow":5,"light_forest":4,"mid_forest":3,"deep_forest":3}
    SEASONS=["apple","orange","yellow","pink"]
    for r in range(N):
        for c in range(N):
            if (c,r) in block or (c,r) in occupied: continue
            z=biome(c,r,N,lay["meadow_pockets"],jit)
            if (c,r) in hs: continue
            if random.random()>=TREE_PR.get(z,0): continue
            g=GAP[z]
            if any(abs(c-tx)<g and abs(r-ty)<g for (tx,ty) in trunks): continue
            roll=random.random()
            if z=="deep_forest" and roll<0.12:
                cells=fits(TREE_HERO,c,r)
                if not cells: continue
                stamp_to("props_trees",TREE_HERO,c,r,cells); trunks.append((c,r))
            elif roll<0.28 and z in("light_forest","mid_forest","meadow"):
                cells=fits(TREE_PLAIN,c,r)
                if not cells: continue
                ft=random.choice(SEASONS)
                stamp_to("props_trees",TREE_PLAIN,c,r,cells); trunks.append((c,r))
                dyn.append(("fruit_tree",c,r,{"baseTree":[gg for (_,_,gg) in TREE_PLAIN],
                            "fruitType":ft,"fruitOverlay":[gg for (_,_,gg) in FRUIT_OVERLAY[ft]]}))
            else:
                st=random.choice([TREE_PLAIN,TREE_SMALL,TREE_SMALL])
                cells=fits(st,c,r)
                if not cells: continue
                stamp_to("props_trees",st,c,r,cells); trunks.append((c,r))
    UNDER_PR={"meadow":0.10,"light_forest":0.16,"mid_forest":0.22,"deep_forest":0.30}
    for r in range(N):
        for c in range(N):
            if (c,r) in block or (c,r) in occupied or (c,r) in hs: continue
            z=biome(c,r,N,lay["meadow_pockets"],jit)
            if random.random()>=UNDER_PR.get(z,0): continue
            roll=random.random()
            if z in("meadow","light_forest") and roll<0.34:
                sp=random.choice(["flower_yellow","flower_pink","flower_blue"]); fr=DYN[sp]
                put(L,"props_ground",c,r,fr[0]); occupied.add((c,r))
                dyn.append(("flower",c,r,{"species":sp,"frames":fr,"offset":random.randint(0,len(fr)-1)}))
            elif z in("mid_forest","deep_forest") and roll<0.40:
                sp=random.choice(["mushroom_red","mushroom_purple"]); fr=DYN[sp]
                put(L,"props_ground",c,r,fr[0]); occupied.add((c,r))
                dyn.append(("mushroom",c,r,{"species":sp,"frames":fr,"offset":random.randint(0,len(fr)-1)}))
            else:
                pick=random.random()
                if pick<0.34: st=random.choice(TUFTS)
                elif pick<0.60: st=random.choice(PEBBLES)
                elif pick<0.78: st=BUSH
                elif pick<0.90 and z!="meadow": st=random.choice(LOGS)
                elif pick<0.95: st=STUMP
                else: st=BOULDER if z=="deep_forest" else random.choice(TUFTS)
                cells=fits(st,c,r)
                if not cells: continue
                stamp_to("props_ground",st,c,r,cells)
    for (px,py,rad) in lay["meadow_pockets"][:3]:
        cells=fits(SUNFLOWER,px,py)
        if cells: stamp_to("props_ground",SUNFLOWER,px,py,cells)
    wlist=list(water); random.shuffle(wlist)
    for (c,r) in wlist[:max(8,len(wlist)//35)]:
        if 0<=c<N and 0<=r<N and L["props_water"][r*N+c]==0:
            st=random.choice(WATER_ROCKS+REEDS+LILIES+LILIES)
            put(L,"props_water",c,r,st[0][2])
    for (x,y,kind) in lay["payloads"]: markers.append(("payload",kind,x,y))
    stats=dict(N=N,trees=len(trunks),dynamic=len(dyn),bridges=len(bridges),
               water=len(water),paths=len(paths),pockets=len(lay["meadow_pockets"]))
    return L,dyn,markers,bridges,stats
print("build appended")

# ============================ emit TMX + preview ============================
def _xml(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")
def emit_tmx(path,N,L,dyn,markers):
    oid=[0]
    def nid(): oid[0]+=1; return oid[0]
    o=['<?xml version="1.0" encoding="UTF-8"?>']
    o.append('<map version="1.10" tiledversion="1.12.2" orientation="orthogonal" renderorder="right-down" '
             'width="%d" height="%d" tilewidth="16" tileheight="16" infinite="0" nextlayerid="%d" nextobjectid="REPLACE">'
             %(N,N,len(LAYERS)+3))
    for (n,fg,tc,c,w,h,src) in TS:
        o.append(' <tileset firstgid="%d" source="%s"/>'%(fg,_xml(TSX_SRC[n])))
    lid=1
    for nm in LAYERS:
        o.append(' <layer id="%d" name="%s" width="%d" height="%d">'%(lid,nm,N,N)); lid+=1
        o.append('  <data encoding="csv">')
        d=L[nm]; o.append(",\n".join(",".join(map(str,d[r*N:(r+1)*N])) for r in range(N)))
        o.append('  </data>'); o.append(' </layer>')
    # nature_dynamic object layer
    o.append(' <objectgroup id="%d" name="nature_dynamic">'%lid); lid+=1
    for (kind,c,r,meta) in dyn:
        x=c*16+8; y=r*16+8
        o.append('  <object id="%d" name="%s" type="%s" x="%g" y="%g"><point/><properties>'%(nid(),_xml(meta.get("species",kind)),kind,x,y))
        o.append('   <property name="kind" value="%s"/>'%_xml(kind))
        if "species" in meta: o.append('   <property name="species" value="%s"/>'%_xml(meta["species"]))
        if "frames" in meta:
            o.append('   <property name="frames" value="%s"/>'%",".join(map(str,meta["frames"])))
            o.append('   <property name="offset" type="int" value="%d"/>'%meta["offset"])
        if "fruitType" in meta:
            o.append('   <property name="fruitType" value="%s"/>'%meta["fruitType"])
            o.append('   <property name="baseTree" value="%s"/>'%",".join(map(str,meta["baseTree"])))
            o.append('   <property name="fruitOverlay" value="%s"/>'%",".join(map(str,meta["fruitOverlay"])))
        o.append('  </properties></object>')
    o.append(' </objectgroup>')
    # markers object layer (homestead structures, gates, payloads, player start)
    o.append(' <objectgroup id="%d" name="markers">'%lid); lid+=1
    for (cls,name,c,r) in markers:
        x=c*16+8; y=r*16+8
        o.append('  <object id="%d" name="%s" type="%s" x="%g" y="%g"><point/></object>'%(nid(),_xml(name),_xml(cls),x,y))
    o.append(' </objectgroup>'); o.append('</map>')
    xml="\n".join(o).replace('nextobjectid="REPLACE"','nextobjectid="%d"'%(oid[0]+1))
    open(path,"w").write(xml)
    return len(xml)

def preview(path,N,L,markers,bridges):
    from PIL import Image, ImageDraw
    def col(g):
        if g==0: return None
        if g<=77: return (150,192,92)
        if g<=154: return (74,112,58)
        if g<=231: return (170,120,75)
        if g<=308: return (78,60,44)
        if g<=385: return (140,140,150)
        if g<=389: return (66,128,200)
        if g<=405: return (180,180,185)
        if g<=421: return (190,150,95)
        if g<=433: return (205,150,88)
        if g<=517: return (28,60,28)      # trees
        if g<=577: return (150,170,70)    # understory mfs (flowers/mush/stones)
        if g<=601: return (90,160,170)    # water props
        if g<=633: return (150,100,60)    # fences
        if g<=663: return (220,150,60)    # gates
        if g<=667: return (80,150,210)    # well
        if g<=671: return (200,170,90)    # work
        return (150,110,70)
    PRI=["props_trees","props_ground","props_water","structures","fences","bridges","paths_main","paths_spur","water","ground"]
    img=Image.new("RGB",(N,N),(150,192,92)); px=img.load()
    for r in range(N):
        for c in range(N):
            for nm in PRI:
                g=L[nm][r*N+c]
                if g:
                    cc=col(g)
                    if cc: px[c,r]=cc; break
    S=3 if N<=150 else 2
    img=img.resize((N*S,N*S),Image.NEAREST); d=ImageDraw.Draw(img)
    for (cls,name,c,r) in markers:
        x=c*S+S//2; y=r*S+S//2
        c2={"player_start":(255,0,255),"gate":(0,255,255),"well":(80,150,255),
            "work_station":(230,200,90),"bed":(150,110,70),"payload":(255,60,60)}.get(cls,(255,255,255))
        d.rectangle([x-2,y-2,x+2,y+2],fill=c2)
    img.save(path)

# ============================ main ============================
import os
RUN=[("world_v1_a",150,"a",111),("world_v1_b",150,"b",222),("world_v1_massive",400,"a",333)]
allstats={}
for (base,N,variant,seed) in RUN:
    L,dyn,markers,bridges,stats=build(N,variant,seed)
    nb=emit_tmx(OUT+base+".tmx",N,L,dyn,markers)
    preview("/sessions/wizardly-awesome-pasteur/mnt/outputs/prev_%s.png"%base,N,L,markers,bridges)
    stats["tmx_bytes"]=os.path.getsize(OUT+base+".tmx")
    stats["markers"]=len(markers)
    allstats[base]=stats
    print("%-18s %s"%(base,stats))
print("STATS",json.dumps(allstats))
